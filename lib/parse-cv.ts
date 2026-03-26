/**
 * Extracts plain text from a PDF buffer.
 * Uses pdf-parse via its internal entry point to avoid the Next.js
 * serverless init error caused by pdf-parse/index.js reading a test file.
 */
export async function extractCvText(pdfBuffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse/lib/pdf-parse') as (
    buf: Buffer,
    options?: object,
  ) => Promise<{ text: string }>;

  const { text } = await pdfParse(pdfBuffer);

  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')   // collapse horizontal whitespace
    .replace(/\n{3,}/g, '\n\n')   // collapse excessive blank lines
    .trim()
    .slice(0, 8000);              // generous but bounded context for Groq
}
