import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/lib/supabase-service', () => ({
  createServiceClient: vi.fn(),
}));

vi.mock('@/app/api/scrape/stream/route', () => ({
  scrapeForUser: vi.fn(),
}));

vi.mock('@/lib/telegram', () => ({
  notifyTelegram: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/require-premium', () => ({
  isPremium: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/env', () => ({
  SUPABASE_URL:              'http://localhost:54321',
  SUPABASE_ANON_KEY:         'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
}));

function makeFetchResponse(ok: boolean, data: unknown = { count: 0 }) {
  return { ok, json: vi.fn().mockResolvedValue(data) };
}

const mockFetch = vi.fn().mockResolvedValue(makeFetchResponse(true));
global.fetch = mockFetch;

process.env.CRON_SECRET = 'test-secret';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
process.env.VAPID_SUBJECT = 'mailto:test@test.com';
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pubkey';
process.env.VAPID_PRIVATE_KEY = 'privkey';

import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase-service';
import { scrapeForUser } from '@/app/api/scrape/stream/route';

function makeDeleteChain() {
  const then = vi.fn().mockResolvedValue({});
  const eq = vi.fn().mockReturnValue({ then });
  const del = vi.fn().mockReturnValue({ eq });
  return { del, eq, then };
}

function makeServiceMock(sub: unknown | null) {
  const { del, eq, then } = makeDeleteChain();
  const from = vi.fn((table: string) => {
    if (table === 'push_subscriptions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: sub }) }),
        }),
        delete: del,
      };
    }
    const node: Record<string, unknown> = { single: vi.fn().mockResolvedValue({ data: {} }) };
    node.eq = vi.fn().mockReturnValue(node);
    const insert = vi.fn().mockReturnValue({ then: vi.fn().mockResolvedValue({}) });
    return { select: vi.fn().mockReturnValue(node), insert };
  });
  return { from, deleteEq: eq, deleteThen: then };
}

async function callRoute(authHeader: string, body: object) {
  const { POST } = await import('./route');
  const req = new Request('http://localhost/api/pipeline/run', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req);
}

describe('POST /api/pipeline/run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockFetch.mockResolvedValue(makeFetchResponse(true));
  });

  it('rejects missing/wrong auth', async () => {
    const res = await callRoute('Bearer wrong', { userId: 'u1' });
    expect(res.status).toBe(401);
  });

  it('returns success with count', async () => {
    vi.mocked(scrapeForUser).mockResolvedValue(3);
    const { from } = makeServiceMock(null);
    vi.mocked(createServiceClient).mockReturnValue({ from } as never);

    const res = await callRoute('Bearer test-secret', { userId: 'u1' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, count: 3 });
  });

  it('sends push notification when count > 0 and sub exists', async () => {
    vi.mocked(scrapeForUser).mockResolvedValue(2);
    const fakeSub = { endpoint: 'https://push.example.com', keys: { p256dh: 'k', auth: 'a' } };
    const { from } = makeServiceMock({ subscription: fakeSub });
    vi.mocked(createServiceClient).mockReturnValue({ from } as never);

    await callRoute('Bearer test-secret', { userId: 'u1' });

    expect(webpush.sendNotification).toHaveBeenCalled();
    expect(vi.mocked(webpush.sendNotification).mock.calls[0][0]).toEqual(fakeSub);
    const payload = JSON.parse(vi.mocked(webpush.sendNotification).mock.calls[0][1] as string);
    expect(payload.title).toBe('Nieuwe vacatures gevonden 🎯');
    expect(payload.body).toBe('2 nieuwe jobs klaar.');
    expect(payload.data.url).toBe('/queue');
  });

  it('skips push notification when count is 0', async () => {
    vi.mocked(scrapeForUser).mockResolvedValue(0);
    const { from } = makeServiceMock({ subscription: { endpoint: 'https://push.example.com' } });
    vi.mocked(createServiceClient).mockReturnValue({ from } as never);

    await callRoute('Bearer test-secret', { userId: 'u1' });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('skips push notification when no subscription', async () => {
    vi.mocked(scrapeForUser).mockResolvedValue(5);
    const { from } = makeServiceMock(null);
    vi.mocked(createServiceClient).mockReturnValue({ from } as never);

    await callRoute('Bearer test-secret', { userId: 'u1' });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('deletes stale subscription on 410', async () => {
    vi.mocked(scrapeForUser).mockResolvedValue(1);
    const fakeSub = { subscription: { endpoint: 'https://push.example.com', keys: {} } };
    const { del, eq, then, from } = (() => {
      const then = vi.fn().mockResolvedValue({});
      const eq = vi.fn().mockReturnValue({ then });
      const del = vi.fn().mockReturnValue({ eq });
      const selectEq = vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: fakeSub }),
      });
      const from = vi.fn((table: string) => {
        if (table === 'push_subscriptions') return { select: vi.fn().mockReturnValue({ eq: selectEq }), delete: del };
        const n: Record<string, unknown> = { single: vi.fn().mockResolvedValue({ data: {} }) };
        n.eq = vi.fn().mockReturnValue(n);
        return { select: vi.fn().mockReturnValue(n), insert: vi.fn().mockReturnValue({ then: vi.fn().mockResolvedValue({}) }) };
      });
      return { del, eq, then, from };
    })();
    vi.mocked(createServiceClient).mockReturnValue({ from } as never);

    const pushErr = Object.assign(new Error('Gone'), { statusCode: 410 });
    vi.mocked(webpush.sendNotification).mockRejectedValue(pushErr);

    await callRoute('Bearer test-secret', { userId: 'u1' });

    await vi.waitFor(() => expect(del).toHaveBeenCalled());
    expect(eq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('does not delete subscription on non-410/404 push error', async () => {
    vi.mocked(scrapeForUser).mockResolvedValue(1);
    const fakeSub = { subscription: { endpoint: 'https://push.example.com', keys: {} } };
    const del = vi.fn();
    const from = vi.fn((table: string) => {
      if (table === 'push_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: fakeSub }) }),
          }),
          delete: del,
        };
      }
      const n: Record<string, unknown> = { single: vi.fn().mockResolvedValue({ data: {} }) };
      n.eq = vi.fn().mockReturnValue(n);
      return { select: vi.fn().mockReturnValue(n), insert: vi.fn().mockReturnValue({ then: vi.fn().mockResolvedValue({}) }) };
    });
    vi.mocked(createServiceClient).mockReturnValue({ from } as never);

    const pushErr = Object.assign(new Error('Server Error'), { statusCode: 500 });
    vi.mocked(webpush.sendNotification).mockRejectedValue(pushErr);

    await callRoute('Bearer test-secret', { userId: 'u1' });
    await new Promise(r => setTimeout(r, 10));
    expect(del).not.toHaveBeenCalled();
  });
});
