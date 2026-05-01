export const metadata = { title: 'Algemene voorwaarden — JobTide' };

export default function TermsPage() {
  return (
    <>
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Algemene voorwaarden</h1>
      <p className="text-xs" style={{ color: 'var(--text2)' }}>Laatst bijgewerkt: 1 mei 2026</p>

      <h2 className="text-base font-semibold mt-2">1. Wie zijn wij</h2>
      <p className="text-sm" style={{ color: 'var(--text2)' }}>
        JobTide is een persoonlijk project van Jordy Beer (België). De dienst helpt je vacatures te
        vinden, te scoren en motivatiebrieven te schrijven.
      </p>

      <h2 className="text-base font-semibold mt-2">2. Account</h2>
      <p className="text-sm" style={{ color: 'var(--text2)' }}>
        Je logt in met Google of e-mail. Je bent zelf verantwoordelijk voor de gegevens die je
        deelt (CV, sleutels, voorkeuren). Bij misbruik kunnen wij je toegang opschorten.
      </p>

      <h2 className="text-base font-semibold mt-2">3. Gebruik</h2>
      <p className="text-sm" style={{ color: 'var(--text2)' }}>
        JobTide is een hulpmiddel, geen garantie op werk. Je gebruikt automatisch verzonden
        sollicitaties op eigen risico. Spam, scraping van persoonsgegevens of misbruik van de
        dienst is niet toegestaan.
      </p>

      <h2 className="text-base font-semibold mt-2">4. Betalingen</h2>
      <p className="text-sm" style={{ color: 'var(--text2)' }}>
        Premium-abonnementen lopen via Stripe (web) of de App Store (iOS). Annuleren kan op elk
        moment, je behoudt toegang tot het einde van de lopende periode.
      </p>

      <h2 className="text-base font-semibold mt-2">5. Aansprakelijkheid</h2>
      <p className="text-sm" style={{ color: 'var(--text2)' }}>
        Wij doen ons best, maar geven geen garanties op beschikbaarheid of juistheid van scrape-
        resultaten. Aansprakelijkheid is beperkt tot het bedrag dat je in de laatste 3 maanden
        hebt betaald.
      </p>

      <h2 className="text-base font-semibold mt-2">6. Wijzigingen</h2>
      <p className="text-sm" style={{ color: 'var(--text2)' }}>
        Wij kunnen deze voorwaarden aanpassen. Bij belangrijke wijzigingen sturen we een melding
        in de app of per e-mail.
      </p>

      <h2 className="text-base font-semibold mt-2">7. Contact</h2>
      <p className="text-sm" style={{ color: 'var(--text2)' }}>
        Vragen? Mail <a href="mailto:jordybeer@duck.com" style={{ color: 'var(--accent)' }}>jordybeer@duck.com</a>.
      </p>
    </>
  );
}
