import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scrapeJobDescriptionWithHtml, scrapeJobDescription, resolveRedirect } from '@/lib/scrape-job-description';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal Response-like object for mocking fetch. */
function makeResponse(body: string, status = 200, url?: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: url ?? '',
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// fetchViaJina — Jina URL construction (key change in this PR)
// ---------------------------------------------------------------------------
// fetchViaJina is not exported, so we test it via scrapeJobDescriptionWithHtml
// by passing a JINA_ONLY_HOSTS domain and asserting on the captured fetch URL.

describe('fetchViaJina URL construction (PR change)', () => {
  let capturedUrls: string[];
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    capturedUrls = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      capturedUrls.push(url);
      // Return a long enough body so the result is accepted (>150 chars)
      const body = 'a'.repeat(300);
      return makeResponse(body);
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('calls Jina Reader with the direct target URL (no proxy encoding)', async () => {
    const targetUrl = 'https://www.jobat.be/nl/job/12345';
    await scrapeJobDescriptionWithHtml(targetUrl);

    // Among all fetch calls, at least one should hit r.jina.ai/<targetUrl>
    const jinaCall = capturedUrls.find(u => u.startsWith('https://r.jina.ai/'));
    expect(jinaCall).toBeDefined();
    expect(jinaCall).toBe(`https://r.jina.ai/${targetUrl}`);
  });

  it('does NOT use the old proxy.jina.ai URL format', async () => {
    const targetUrl = 'https://www.stepstone.be/nl/job/456';
    await scrapeJobDescriptionWithHtml(targetUrl);

    const oldProxyCall = capturedUrls.find(u => u.includes('proxy.jina.ai'));
    expect(oldProxyCall).toBeUndefined();
  });

  it('does NOT percent-encode the target URL in the Jina request', async () => {
    const targetUrl = 'https://www.indeed.com/viewjob?jk=abc123&from=hp';
    await scrapeJobDescriptionWithHtml(targetUrl);

    const jinaCall = capturedUrls.find(u => u.startsWith('https://r.jina.ai/'));
    expect(jinaCall).toBeDefined();
    // Old code encoded the URL: `encodeURIComponent(targetUrl)`
    // New code passes it directly, so it should contain '?' and '=' literally
    expect(jinaCall).toContain('?jk=abc123');
    expect(jinaCall).not.toContain('%3F'); // %3F is encoded '?'
    expect(jinaCall).not.toContain('%3D'); // %3D is encoded '='
  });

  it('uses Jina directly for vdab.be (JINA_ONLY_HOSTS)', async () => {
    const targetUrl = 'https://www.vdab.be/vacatures/1234';
    await scrapeJobDescriptionWithHtml(targetUrl);

    const jinaCall = capturedUrls.find(u => u.startsWith('https://r.jina.ai/'));
    expect(jinaCall).toBe(`https://r.jina.ai/${targetUrl}`);
  });

  it('uses Jina directly for stepstone.nl (JINA_ONLY_HOSTS)', async () => {
    const targetUrl = 'https://www.stepstone.nl/werk/developer';
    await scrapeJobDescriptionWithHtml(targetUrl);

    const jinaCall = capturedUrls.find(u => u.startsWith('https://r.jina.ai/'));
    expect(jinaCall).toBe(`https://r.jina.ai/${targetUrl}`);
  });

  it('uses Jina directly for monster.com (JINA_ONLY_HOSTS)', async () => {
    const targetUrl = 'https://www.monster.com/jobs/view/12345';
    await scrapeJobDescriptionWithHtml(targetUrl);

    const jinaCall = capturedUrls.find(u => u.startsWith('https://r.jina.ai/'));
    expect(jinaCall).toBe(`https://r.jina.ai/${targetUrl}`);
  });

  it('falls back to Jina when direct HTML fetch returns empty (non-JINA_ONLY host)', async () => {
    const targetUrl = 'https://www.someunknownjobboard.com/job/9999';

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      capturedUrls.push(url);
      if (url.startsWith('https://r.jina.ai/')) {
        return makeResponse('b'.repeat(300)); // Jina returns content
      }
      // Direct fetch returns too-short content to trigger fallback
      return makeResponse('too short');
    });

    await scrapeJobDescriptionWithHtml(targetUrl);

    const jinaCall = capturedUrls.find(u => u.startsWith('https://r.jina.ai/'));
    expect(jinaCall).toBe(`https://r.jina.ai/${targetUrl}`);
  });
});

// ---------------------------------------------------------------------------
// scrapeJobDescriptionWithHtml — overall behaviour
// ---------------------------------------------------------------------------

describe('scrapeJobDescriptionWithHtml', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns empty description for adzuna.be URLs that do not redirect', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      // HEAD request for adzuna redirect — returns same URL (no redirect)
      return makeResponse('', 200, url);
    });

    const result = await scrapeJobDescriptionWithHtml('https://www.adzuna.be/land/ad/12345');
    expect(result.description).toBe('');
    expect(result.html).toBe('');
  });

  it('returns { description, html } shape', async () => {
    globalThis.fetch = vi.fn(async () => makeResponse('<html><main>' + 'x'.repeat(300) + '</main></html>'));

    const result = await scrapeJobDescriptionWithHtml('https://www.example-jobs.com/job/1');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('html');
  });

  it('returns empty on fetch exception', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('Network error'); });

    const result = await scrapeJobDescriptionWithHtml('https://www.example-jobs.com/job/1');
    expect(result.description).toBe('');
    expect(result.html).toBe('');
  });

  it('returns empty when Jina response is under 150 chars', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('https://r.jina.ai/')) {
        return makeResponse('Short response'); // under 150 chars
      }
      return makeResponse(''); // direct fetch also empty
    });

    const result = await scrapeJobDescriptionWithHtml('https://www.jobat.be/job/short');
    expect(result.description).toBe('');
  });

  it('truncates description to 6000 characters', async () => {
    const longContent = 'w'.repeat(10000);
    globalThis.fetch = vi.fn(async () => makeResponse(longContent));

    const result = await scrapeJobDescriptionWithHtml('https://www.vdab.be/job/long');
    expect(result.description.length).toBeLessThanOrEqual(6000);
  });
});

// ---------------------------------------------------------------------------
// scrapeJobDescription — backwards-compatible wrapper
// ---------------------------------------------------------------------------

describe('scrapeJobDescription', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns a string (not an object)', async () => {
    globalThis.fetch = vi.fn(async () => makeResponse('<html><main>' + 'y'.repeat(300) + '</main></html>'));

    const result = await scrapeJobDescription('https://www.example-jobs.com/job/2');
    expect(typeof result).toBe('string');
  });

  it('returns the same description as scrapeJobDescriptionWithHtml', async () => {
    const content = '<html><article>' + 'z'.repeat(300) + '</article></html>';
    globalThis.fetch = vi.fn(async () => makeResponse(content));

    const url = 'https://www.example-jobs.com/job/3';
    const wrapper = await scrapeJobDescription(url);
    globalThis.fetch = vi.fn(async () => makeResponse(content));
    const full = await scrapeJobDescriptionWithHtml(url);
    expect(wrapper).toBe(full.description);
  });

  it('returns empty string on error', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('fail'); });

    const result = await scrapeJobDescription('https://www.example-jobs.com/job/err');
    expect(result).toBe('');
  });
});

// ---------------------------------------------------------------------------
// resolveRedirect
// ---------------------------------------------------------------------------

describe('resolveRedirect', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns the redirected URL when response URL differs from input', async () => {
    const inputUrl = 'https://www.adzuna.be/land/ad/12345';
    const finalUrl = 'https://www.somecompany.com/jobs/developer';

    globalThis.fetch = vi.fn(async () => makeResponse('', 200, finalUrl));

    const result = await resolveRedirect(inputUrl);
    expect(result).toBe(finalUrl);
  });

  it('returns the original URL when no redirect occurs (same URL)', async () => {
    const inputUrl = 'https://www.adzuna.be/land/ad/12345';

    globalThis.fetch = vi.fn(async () => makeResponse('', 200, inputUrl));

    const result = await resolveRedirect(inputUrl);
    expect(result).toBe(inputUrl);
  });

  it('returns the original URL on fetch exception', async () => {
    const inputUrl = 'https://www.adzuna.be/land/ad/timeout';

    globalThis.fetch = vi.fn(async () => { throw new Error('AbortError'); });

    const result = await resolveRedirect(inputUrl);
    expect(result).toBe(inputUrl);
  });

  it('returns the original URL when response URL is empty', async () => {
    const inputUrl = 'https://www.adzuna.be/land/ad/empty';

    globalThis.fetch = vi.fn(async () => makeResponse('', 200, ''));

    const result = await resolveRedirect(inputUrl);
    expect(result).toBe(inputUrl);
  });
});