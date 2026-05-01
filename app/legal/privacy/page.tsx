export const metadata = { title: 'Privacybeleid — JobTide' };

export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Privacybeleid</h1>
      <p className="text-xs" style={{ color: 'var(--text2)' }}>Laatst bijgewerkt: 1 mei 2026</p>

      <h2 className="text-base font-semibold mt-2">Wat we verzamelen</h2>
      <ul className="text-sm list-disc pl-5 flex flex-col gap-1" style={{ color: 'var(--text2)' }}>
        <li>E-mailadres en (optioneel) avatar van je login provider</li>
        <li>Je CV (PDF + tekst-extractie) — voor matching en motivatiebrieven</li>
        <li>Voorkeuren: trefwoorden, locatie, radius, drempels</li>
        <li>API-sleutels die jij toevoegt (Groq, Adzuna, Gmail) — versleuteld waar mogelijk</li>
        <li>Sollicitatiegeschiedenis en match-scores</li>
        <li>Anonieme client-versie en foutlogs (geen IP, geen tracking)</li>
      </ul>

      <h2 className="text-base font-semibold mt-2">Waarom</h2>
      <p className="text-sm" style={{ color: 'var(--text2)' }}>
        Uitsluitend om de dienst te leveren. Geen advertenties, geen verkoop aan derden, geen
        analytics-pixels.
      </p>

      <h2 className="text-base font-semibold mt-2">Sub-verwerkers</h2>
      <ul className="text-sm list-disc pl-5 flex flex-col gap-1" style={{ color: 'var(--text2)' }}>
        <li><strong>Supabase</strong> (EU) — database, opslag, authenticatie</li>
        <li><strong>Vercel</strong> (EU) — hosting</li>
        <li><strong>Groq</strong> (US) — LLM-scoring van vacatures</li>
        <li><strong>Anthropic</strong> (US) — premium LLM (Claude) voor betalende gebruikers</li>
        <li><strong>Resend</strong> (EU) — transactionele e-mail</li>
        <li><strong>Adzuna / Jina</strong> — vacature-data</li>
        <li><strong>Stripe</strong> / <strong>Apple</strong> — betalingen</li>
      </ul>

      <h2 className="text-base font-semibold mt-2">Bewaartermijn</h2>
      <p className="text-sm" style={{ color: 'var(--text2)' }}>
        Zolang je account actief is. Bij verwijdering: alles weg binnen 30 dagen, inclusief
        backups.
      </p>

      <h2 className="text-base font-semibold mt-2">Jouw rechten</h2>
      <p className="text-sm" style={{ color: 'var(--text2)' }}>
        Inzage, correctie en verwijdering — zie de <a href="/legal/gdpr" style={{ color: 'var(--accent)' }}>GDPR-pagina</a>.
        Account verwijderen kan met één tik in <a href="/settings" style={{ color: 'var(--accent)' }}>Instellingen</a>.
      </p>

      <h2 className="text-base font-semibold mt-2">Contact</h2>
      <p className="text-sm" style={{ color: 'var(--text2)' }}>
        <a href="mailto:jordybeer@duck.com" style={{ color: 'var(--accent)' }}>jordybeer@duck.com</a>
      </p>
    </>
  );
}
