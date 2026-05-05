export const metadata = { title: 'GDPR — JobTide' };

export default function GdprPage() {
  return (
    <>
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>GDPR / AVG</h1>
      <p className="text-xs" style={{ color: 'var(--text2)' }}>Laatst bijgewerkt: 1 mei 2026</p>

      <h2 className="text-base font-semibold mt-2">Verwerkingsverantwoordelijke</h2>
      <p className="text-sm" style={{ color: 'var(--text2)' }}>
        Jordy Beer, België. Contact: <a href="mailto:jordybeer@duck.com" style={{ color: 'var(--accent)' }}>jordybeer@duck.com</a>.
      </p>

      <h2 className="text-base font-semibold mt-2">Rechtsgrond</h2>
      <p className="text-sm" style={{ color: 'var(--text2)' }}>
        Uitvoering van de overeenkomst (art. 6.1.b AVG): we verwerken je gegevens om de dienst te
        leveren waarvoor je je hebt aangemeld.
      </p>

      <h2 className="text-base font-semibold mt-2">Jouw rechten</h2>
      <ul className="text-sm list-disc pl-5 flex flex-col gap-1" style={{ color: 'var(--text2)' }}>
        <li><strong>Inzage</strong> — vraag een kopie van al je data op</li>
        <li><strong>Correctie</strong> — laat foutieve data aanpassen</li>
        <li><strong>Verwijdering</strong> — direct in de app via Instellingen → Account verwijderen</li>
        <li><strong>Overdraagbaarheid</strong> — exporteer je sollicitaties als JSON op verzoek</li>
        <li><strong>Bezwaar</strong> — tegen verwerking die op een gerechtvaardigd belang steunt</li>
        <li><strong>Klacht</strong> — bij de Gegevensbeschermingsautoriteit (gegevensbeschermingsautoriteit.be)</li>
      </ul>

      <h2 className="text-base font-semibold mt-2">Doorgifte buiten de EU</h2>
      <p className="text-sm" style={{ color: 'var(--text2)' }}>
        Voor LLM-scoring (Anthropic) wordt de relevante context tijdelijk naar de VS
        gestuurd. Anthropic is gecertificeerd onder het EU-VS Data Privacy Framework.
      </p>

      <h2 className="text-base font-semibold mt-2">Beveiliging</h2>
      <p className="text-sm" style={{ color: 'var(--text2)' }}>
        Alle verbindingen via TLS. Wachtwoorden via Supabase Auth (bcrypt/argon2). Toegang tot
        je rijen wordt afgedwongen door Row Level Security policies in Postgres.
      </p>

      <h2 className="text-base font-semibold mt-2">Verzoeken</h2>
      <p className="text-sm" style={{ color: 'var(--text2)' }}>
        Mail <a href="mailto:jordybeer@duck.com" style={{ color: 'var(--accent)' }}>jordybeer@duck.com</a>.
        We reageren binnen 30 dagen.
      </p>
    </>
  );
}
