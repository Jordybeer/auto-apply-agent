import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SeverityNumber } from '@opentelemetry/api-logs';

// Mock slog so internal logging doesn't throw
vi.mock('@/lib/logger', () => ({
  slog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock Anthropic client
vi.mock('@anthropic-ai/sdk', () => {
  const create = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({ messages: { create } })),
    __create: create,
  };
});

import Anthropic from '@anthropic-ai/sdk';
const mockCreate = (Anthropic as unknown as { __create: ReturnType<typeof vi.fn> }).__create;

describe('PostHog OTel token logging', () => {
  const mockEmit = vi.fn();

  beforeEach(() => {
    mockEmit.mockClear();
    (globalThis as Record<string, unknown>).__posthogLogger = { emit: mockEmit };
    // Provide a fake API key so the module-level client is not null
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__posthogLogger;
    delete process.env.ANTHROPIC_API_KEY;
  });

  function stubAnthropicResponse(text: string, inputTokens = 100, outputTokens = 50) {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text }],
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    });
  }

  it('emits a PostHog OTel log after scoreAndExtractJob', async () => {
    stubAnthropicResponse('{"score":80,"reasoning":"Good fit","titel":"Dev","bedrijf":"Acme"}');
    const { scoreAndExtractJob } = await import('@/lib/anthropic');
    await scoreAndExtractJob({
      jobDescription: 'A job',
      cvText: 'My CV',
      keywords: ['js'],
      location: 'Antwerp',
      userId: 'user-123',
    });

    expect(mockEmit).toHaveBeenCalledOnce();
    const call = mockEmit.mock.calls[0][0];
    expect(call.severityNumber).toBe(SeverityNumber.INFO);
    expect(call.attributes['llm.input_tokens']).toBe(100);
    expect(call.attributes['llm.output_tokens']).toBe(50);
    expect(call.attributes['llm.user_id']).toBe('user-123');
  });

  it('uses "anonymous" when no userId is provided', async () => {
    stubAnthropicResponse('{"score":60,"reasoning":"Ok","titel":"Dev","bedrijf":"X"}');
    const { scoreAndExtractJob } = await import('@/lib/anthropic');
    await scoreAndExtractJob({
      jobDescription: 'A job',
      cvText: 'CV',
      keywords: [],
      location: '',
    });

    const call = mockEmit.mock.calls[0][0];
    expect(call.attributes['llm.user_id']).toBe('anonymous');
  });

  it('does not throw when __posthogLogger is not set', async () => {
    delete (globalThis as Record<string, unknown>).__posthogLogger;
    stubAnthropicResponse('{"score":70,"reasoning":"Fine","titel":"Dev","bedrijf":"Y"}');
    const { scoreAndExtractJob } = await import('@/lib/anthropic');
    await expect(
      scoreAndExtractJob({ jobDescription: 'job', cvText: 'cv', keywords: [], location: '' })
    ).resolves.not.toThrow();
  });

  it('includes model name in the OTel log attributes', async () => {
    stubAnthropicResponse('{"score":75,"reasoning":"Good","titel":"Dev","bedrijf":"Z"}');
    const { scoreAndExtractJob } = await import('@/lib/anthropic');
    await scoreAndExtractJob({ jobDescription: 'job', cvText: 'cv', keywords: [], location: '', userId: 'u1' });

    const call = mockEmit.mock.calls[0][0];
    expect(call.attributes['llm.model']).toContain('claude');
  });
});
