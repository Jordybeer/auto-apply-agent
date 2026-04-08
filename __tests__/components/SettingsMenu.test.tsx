import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before importing the component
// ---------------------------------------------------------------------------

// Mock framer-motion: render children without animations to keep tests simple
vi.mock('framer-motion', () => {
  const React = require('react');
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        // eslint-disable-next-line react/display-name
        React.forwardRef(({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref: React.Ref<unknown>) => {
          // Strip framer-motion-specific props
          const {
            initial, animate, exit, whileTap, whileHover,
            transition, variants, layout, ...rest
          } = props as Record<string, unknown>;
          return React.createElement(tag, { ...rest, ref }, children);
        }),
    },
  );

  return {
    motion,
    AnimatePresence: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
    useAnimation: () => ({}),
    useMotionValue: (v: unknown) => ({ get: () => v, set: () => {} }),
  };
});

// Mock Supabase browser client — no real network calls
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }),
  })),
}));

// Mock heavy child components to avoid deep dependency chains
vi.mock('@/components/CityCombobox', () => ({
  default: () => React.createElement('div', { 'data-testid': 'city-combobox' }),
}));

vi.mock('@/components/ThemeToggle', () => ({
  default: () => React.createElement('button', { 'data-testid': 'theme-toggle' }, 'Theme'),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Check: () => React.createElement('span', { 'data-testid': 'icon-check' }),
  ChevronRight: () => React.createElement('span', { 'data-testid': 'icon-chevron-right' }),
  PenLine: () => React.createElement('span', { 'data-testid': 'icon-penline' }),
  Mail: () => React.createElement('span', { 'data-testid': 'icon-mail' }),
  Terminal: () => React.createElement('span', { 'data-testid': 'icon-terminal' }),
}));

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------
import SettingsMenu from '@/components/SettingsMenu';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a full settings API response. */
function makeSettingsResponse(overrides: Record<string, unknown> = {}) {
  return {
    is_admin: false,
    groq_api_key: null,
    adzuna_app_id: null,
    adzuna_app_key: null,
    adzuna_calls_today: 0,
    adzuna_calls_month: 0,
    keywords: [],
    city: 'Gent',
    radius: 30,
    auto_apply_threshold: null,
    last_scrape_at: null,
    ...overrides,
  };
}

const originalFetch = globalThis.fetch;

function mockSettingsApi(data: Record<string, unknown>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/settings')) {
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(data),
        text: () => Promise.resolve(JSON.stringify(data)),
      } as Response;
    }
    return { ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') } as Response;
  });
}

beforeEach(() => {
  // Provide env vars that SettingsMenu needs to construct the Supabase client
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SettingsMenu — Debug Console link (PR change)', () => {
  it('shows Debug Console link when user is admin', async () => {
    mockSettingsApi(makeSettingsResponse({ is_admin: true }));

    render(React.createElement(SettingsMenu));

    await waitFor(() => {
      expect(screen.getByText('Debug Console')).toBeInTheDocument();
    });
  });

  it('Debug Console link has href="/debug"', async () => {
    mockSettingsApi(makeSettingsResponse({ is_admin: true }));

    render(React.createElement(SettingsMenu));

    await waitFor(() => {
      const link = screen.getByText('Debug Console').closest('a');
      expect(link).toHaveAttribute('href', '/debug');
    });
  });

  it('shows "Verbose pipeline logs" subtitle when admin', async () => {
    mockSettingsApi(makeSettingsResponse({ is_admin: true }));

    render(React.createElement(SettingsMenu));

    await waitFor(() => {
      expect(screen.getByText('Verbose pipeline logs')).toBeInTheDocument();
    });
  });

  it('does NOT show Debug Console link when user is not admin', async () => {
    mockSettingsApi(makeSettingsResponse({ is_admin: false }));

    render(React.createElement(SettingsMenu));

    await waitFor(() => {
      // Wait for data to load (check something always present)
      expect(screen.getByText('Weergave')).toBeInTheDocument();
    });

    expect(screen.queryByText('Debug Console')).toBeNull();
  });

  it('renders a native anchor tag (not a button) for the debug link', async () => {
    mockSettingsApi(makeSettingsResponse({ is_admin: true }));

    render(React.createElement(SettingsMenu));

    await waitFor(() => {
      const link = screen.getByText('Debug Console').closest('a');
      expect(link).not.toBeNull();
      // Should be an <a>, not a <button>
      expect(link?.tagName.toLowerCase()).toBe('a');
    });
  });

  it('does not use router.push for the debug link (no button wrapper)', async () => {
    // The old DebugButton component wrapped a <button> with onClick={() => router.push('/debug')}
    // The new implementation uses a direct <a href="/debug"> element
    mockSettingsApi(makeSettingsResponse({ is_admin: true }));

    render(React.createElement(SettingsMenu));

    await waitFor(() => {
      const link = screen.getByText('Debug Console').closest('a');
      // Verify it's an anchor with the href, not a button
      expect(link).toHaveAttribute('href', '/debug');
      expect(link?.tagName.toLowerCase()).not.toBe('button');
    });
  });

  it('shows loading state before settings are loaded', () => {
    // Never resolve the settings fetch
    globalThis.fetch = vi.fn(() => new Promise(() => {}));

    render(React.createElement(SettingsMenu));

    expect(screen.getByText('Laden...')).toBeInTheDocument();
  });
});

describe('SettingsMenu — general rendering', () => {
  it('renders theme toggle section for all users', async () => {
    mockSettingsApi(makeSettingsResponse());

    render(React.createElement(SettingsMenu));

    await waitFor(() => {
      expect(screen.getByText('Weergave')).toBeInTheDocument();
    });
  });

  it('does not render admin sections for non-admin users', async () => {
    mockSettingsApi(makeSettingsResponse({ is_admin: false }));

    render(React.createElement(SettingsMenu));

    await waitFor(() => {
      expect(screen.getByText('Weergave')).toBeInTheDocument();
    });

    expect(screen.queryByText('Debug Console')).toBeNull();
  });
});