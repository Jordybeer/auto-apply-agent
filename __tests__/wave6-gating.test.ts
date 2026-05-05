import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  SUPABASE_URL:              'http://localhost:54321',
  SUPABASE_ANON_KEY:         'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
}));

vi.mock('@/lib/supabase-service', () => ({
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  slog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { isPremium } from '@/lib/require-premium';
import { checkAndIncrementScoredToday } from '@/lib/anthropic';
import { createServiceClient } from '@/lib/supabase-service';

const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom } as unknown as ReturnType<typeof createServiceClient>;

beforeEach(() => {
  vi.mocked(createServiceClient).mockReturnValue(mockSupabase);
  mockFrom.mockReset();
});

// ─── isPremium ────────────────────────────────────────────────────────────────
describe('isPremium', () => {
  function stubSubscription(data: Record<string, unknown> | null) {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data }),
    });
  }

  it('returns false when no subscription row exists', async () => {
    stubSubscription(null);
    expect(await isPremium('user-1')).toBe(false);
  });

  it('returns false for free tier', async () => {
    stubSubscription({ tier: 'free', status: 'active', current_period_end: null });
    expect(await isPremium('user-1')).toBe(false);
  });

  it('returns false for canceled premium', async () => {
    stubSubscription({ tier: 'premium', status: 'canceled', current_period_end: null });
    expect(await isPremium('user-1')).toBe(false);
  });

  it('returns false for expired premium', async () => {
    stubSubscription({
      tier: 'premium',
      status: 'active',
      current_period_end: new Date(Date.now() - 1000).toISOString(),
    });
    expect(await isPremium('user-1')).toBe(false);
  });

  it('returns true for active premium', async () => {
    stubSubscription({ tier: 'premium', status: 'active', current_period_end: null });
    expect(await isPremium('user-1')).toBe(true);
  });

  it('returns true for trialing premium', async () => {
    stubSubscription({ tier: 'premium', status: 'trialing', current_period_end: null });
    expect(await isPremium('user-1')).toBe(true);
  });

  it('returns true for premium with future period end', async () => {
    stubSubscription({
      tier: 'premium',
      status: 'active',
      current_period_end: new Date(Date.now() + 86400_000).toISOString(),
    });
    expect(await isPremium('user-1')).toBe(true);
  });
});

// ─── checkAndIncrementScoredToday ─────────────────────────────────────────────
describe('checkAndIncrementScoredToday', () => {
  const today = new Date().toISOString().slice(0, 10);

  function stubSettings(scored_today: number, reset_date: string | null) {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { scored_today, scored_today_reset_at: reset_date },
      }),
      update: updateMock,
    });
    return updateMock;
  }

  it('always allows premium users without touching db', async () => {
    const result = await checkAndIncrementScoredToday(mockSupabase, 'user-1', true);
    expect(result.allowed).toBe(true);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('allows free user on first use today and increments', async () => {
    const updateMock = stubSettings(0, today);
    const result = await checkAndIncrementScoredToday(mockSupabase, 'user-1', false);
    expect(result.allowed).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ scored_today: 1 }));
  });

  it('allows free user at 4/5 and increments to 5', async () => {
    const updateMock = stubSettings(4, today);
    const result = await checkAndIncrementScoredToday(mockSupabase, 'user-1', false);
    expect(result.allowed).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ scored_today: 5 }));
  });

  it('blocks free user at 5/5', async () => {
    stubSettings(5, today);
    const result = await checkAndIncrementScoredToday(mockSupabase, 'user-1', false);
    expect(result.allowed).toBe(false);
  });

  it('resets counter when reset_date is yesterday', async () => {
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    const updateMock = stubSettings(5, yesterday);
    const result = await checkAndIncrementScoredToday(mockSupabase, 'user-1', false);
    expect(result.allowed).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ scored_today: 1 }));
  });

  it('resets counter when reset_at is null', async () => {
    const updateMock = stubSettings(5, null);
    const result = await checkAndIncrementScoredToday(mockSupabase, 'user-1', false);
    expect(result.allowed).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ scored_today: 1 }));
  });
});
