const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const CHAT_ID   = parseInt(process.env.TELEGRAM_ALLOWED_USER_ID ?? '0', 10);

export function escTg(s: string | null | undefined): string {
  return (s ?? '').replace(/[_*`[]/g, '\\$&');
}

export function approvalMarkup(jobId: string) {
  return {
    inline_keyboard: [[
      { text: '✅ Solliciteren', callback_data: `apply_${jobId}` },
      { text: '❌ Overslaan',    callback_data: `skip_${jobId}` },
    ]],
  };
}

export async function notifyTelegram(text: string, replyMarkup?: object): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id:    CHAT_ID,
      text,
      parse_mode: 'Markdown',
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  }).catch(() => {});
}
