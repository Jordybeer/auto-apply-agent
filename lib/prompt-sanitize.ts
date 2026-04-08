/**
 * Prompt injection sanitizer.
 *
 * `sanitizePromptInput(s)` strips characters and patterns that could be used
 * to escape the intended prompt context or inject new instructions into an LLM.
 *
 * Use this on every piece of user-supplied or externally-sourced content before
 * interpolating it into a prompt string.
 */
export function sanitizePromptInput(value: string | null | undefined): string {
  if (!value) return '';

  return (
    value
      // Collapse runs of 3+ newlines (common section-break trick)
      .replace(/\n{3,}/g, '\n\n')
      // Strip common prompt-injection delimiters / markdown horizontal rules
      .replace(/^---+\s*$/gm, '')
      .replace(/^===+\s*$/gm, '')
      .replace(/^###\s*(IGNORE|SYSTEM|INSTRUCTIONS?|OVERRIDE|ASSISTANT|USER)\b.*$/gim, '')
      // Strip angle-bracket XML-style injection attempts targeting our delimiters
      .replace(/<\/?(system|instructions?|user_input|user|assistant)\b[^>]*>/gi, '')
      // Strip backtick code-fence blocks that could confuse the model's context
      .replace(/```[\s\S]*?```/g, '[code block removed]')
      .trim()
  );
}
