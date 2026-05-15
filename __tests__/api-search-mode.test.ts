/**
 * Integration-style tests for /api/search-mode GET + POST.
 * Uses Next.js route handler mocking via next-test-api-route-handler.
 */
import { testApiHandler } from 'next-test-api-route-handler';
import * as handler from '@/app/api/search-mode/route';

// Mock Supabase service client
const mockSelect  = jest.fn();
const mockUpsert  = jest.fn();
const mockEq      = jest.fn();
const mockSingle  = jest.fn();

jest.mock('@/lib/supabase-service', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: mockSelect,
      upsert: mockUpsert,
    }),
  }),
}));

// Mock auth so we get a stable user_id
jest.mock('@/lib/supabase-request', () => ({
  getUserId: async () => 'test-user-id',
}));

beforeEach(() => {
  jest.clearAllMocks();

  // Default: row exists with career mode
  mockSingle.mockResolvedValue({ data: { search_mode: 'career', student_job_prefs: null, pivot_prefs: null }, error: null });
  mockEq.mockReturnValue({ single: mockSingle });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockUpsert.mockResolvedValue({ error: null });
});

describe('GET /api/search-mode', () => {
  it('returns 200 with search_mode from db', async () => {
    await testApiHandler({
      appHandler: handler,
      test: async ({ fetch }) => {
        const res = await fetch({ method: 'GET' });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.search_mode).toBe('career');
      },
    });
  });

  it('returns career as default when row is missing', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    await testApiHandler({
      appHandler: handler,
      test: async ({ fetch }) => {
        const res = await fetch({ method: 'GET' });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.search_mode).toBe('career');
      },
    });
  });
});

describe('POST /api/search-mode', () => {
  it('accepts valid student mode and returns 200', async () => {
    await testApiHandler({
      appHandler: handler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            search_mode: 'student',
            student_job_prefs: { max_hours_per_week: 15, flexible_schedule: false, sectors: [], student_status: 'secundair', availability_from: null },
            pivot_prefs: null,
          }),
        });
        expect(res.status).toBe(200);
        expect(mockUpsert).toHaveBeenCalledTimes(1);
      },
    });
  });

  it('rejects unknown search_mode with 400', async () => {
    await testApiHandler({
      appHandler: handler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ search_mode: 'hacker' }),
        });
        expect(res.status).toBe(400);
      },
    });
  });

  it('accepts pivot mode and returns 200', async () => {
    await testApiHandler({
      appHandler: handler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            search_mode: 'pivot',
            student_job_prefs: null,
            pivot_prefs: { target_sectors: ['IT'], transferable_skills: [], open_to_retraining: false },
          }),
        });
        expect(res.status).toBe(200);
      },
    });
  });
});
