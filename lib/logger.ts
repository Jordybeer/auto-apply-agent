/**
 * Server-side logger — writes to `system_logs` table in Supabase.
 * Safe to call from any API route or server action.
 * Never throws — logging failures are silently swallowed so they
 * never break the main request flow.
 */
import { createServiceClient } from '@/lib/supabase-service';

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  level: LogLevel;
  source: string;       // e.g. 'scrape', 'process', 'apply'
  message: string;
  meta?: Record<string, unknown>;
  user_id?: string;
}

export async function serverLog(entry: LogEntry): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.from('system_logs').insert({
      level:   entry.level,
      source:  entry.source,
      message: entry.message,
      meta:    entry.meta ?? null,
      user_id: entry.user_id ?? null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // never break the caller
  }
}

/** Convenience wrappers */
export const slog = {
  log:   (source: string, message: string, meta?: Record<string, unknown>, user_id?: string) =>
    serverLog({ level: 'log',   source, message, meta, user_id }),
  info:  (source: string, message: string, meta?: Record<string, unknown>, user_id?: string) =>
    serverLog({ level: 'info',  source, message, meta, user_id }),
  warn:  (source: string, message: string, meta?: Record<string, unknown>, user_id?: string) =>
    serverLog({ level: 'warn',  source, message, meta, user_id }),
  error: (source: string, message: string, meta?: Record<string, unknown>, user_id?: string) =>
    serverLog({ level: 'error', source, message, meta, user_id }),
  debug: (source: string, message: string, meta?: Record<string, unknown>, user_id?: string) =>
    serverLog({ level: 'debug', source, message, meta, user_id }),
};
