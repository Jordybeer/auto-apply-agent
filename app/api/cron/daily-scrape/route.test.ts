import { describe, it, expect, vi, beforeEach } from 'vitest';

function chainable(resolveValue: unknown) {
  const obj: { eq: ReturnType<typeof vi.fn>; then: (resolve: (v: unknown) => unknown) => Promise<unknown> } = {
    eq: vi.fn(),
    then(resolve) { return Promise.resolve(resolveValue).then(resolve); },
  };
  obj.eq.mockReturnValue(obj);
  return obj;
}

vi.mock('@/lib/supabase-service', () => ({
  createServiceClient: vi.fn(),
}));

const mockFetch = vi.fn().mockResolvedValue({ ok: true });
global.fetch = mockFetch;

process.env.CRON_SECRET = 'test-secret';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

import { createServiceClient } from '@/lib/supabase-service';

async function callRoute(authHeader: string) {
  const { GET } = await import('./route');
  const req = new Request('http://localhost/api/cron/daily-scrape', {
    headers: { Authorization: authHeader },
  });
  return GET(req);
}

describe('GET /api/cron/daily-scrape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it('rejects wrong auth', async () => {
    const res = await callRoute('Bearer wrong');
    expect(res.status).toBe(401);
  });

  it('dispatches one fetch per onboarded user', async () => {
    const users = [{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u3' }];
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(chainable({ data: users })),
      }),
    } as never);

    const res = await callRoute('Bearer test-secret');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.dispatched).toBe(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('dispatches to correct pipeline URL with correct headers', async () => {
    const users = [{ user_id: 'u42' }];
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(chainable({ data: users })),
      }),
    } as never);

    await callRoute('Bearer test-secret');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/pipeline/run',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-secret',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ userId: 'u42' }),
      }),
    );
  });

  it('fires all dispatches in parallel (fire-and-forget)', async () => {
    const users = [{ user_id: 'u1' }, { user_id: 'u2' }];
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(chainable({ data: users })),
      }),
    } as never);

    let resolvers: Array<() => void> = [];
    mockFetch.mockImplementation(() => new Promise<Response>(r => resolvers.push(() => r(new Response()))));

    const responsePromise = callRoute('Bearer test-secret');
    // Route should resolve before fetches complete (fire-and-forget with void)
    const res = await responsePromise;
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    resolvers.forEach(r => r());
  });

  it('returns dispatched:0 when no onboarded users', async () => {
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(chainable({ data: [] })),
      }),
    } as never);

    const res = await callRoute('Bearer test-secret');
    const body = await res.json();
    expect(body.dispatched).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles null data gracefully', async () => {
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(chainable({ data: null })),
      }),
    } as never);

    const res = await callRoute('Bearer test-secret');
    const body = await res.json();
    expect(body.dispatched).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
