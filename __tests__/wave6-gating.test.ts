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

