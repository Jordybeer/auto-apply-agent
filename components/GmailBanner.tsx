'use client';

/**
 * SenderBadge — shows the active outbound email address (info@jordy.beer via Resend).
 * Rendered where GmailBanner was previously used so imports keep working.
 */
export default function GmailBanner() {
  return (
    <div
      role="status"
      aria-label="Actieve verzender"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.25rem 0.625rem',
        borderRadius: '9999px',
        fontSize: '0.72rem',
        fontWeight: 500,
        background: 'var(--green-dim)',
        color: 'var(--green)',
        border: '1px solid rgba(52,211,153,0.25)',
        letterSpacing: '0.01em',
        userSelect: 'none',
      }}
    >
      {/* Pulse dot */}
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--green)',
          flexShrink: 0,
          boxShadow: '0 0 0 0 rgba(52,211,153,0.5)',
          animation: 'sender-pulse 2s ease-in-out infinite',
        }}
      />
      info@jordy.beer
      <style>{`
        @keyframes sender-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(52,211,153,0.45); }
          50%       { box-shadow: 0 0 0 4px rgba(52,211,153,0); }
        }
      `}</style>
    </div>
  );
}
