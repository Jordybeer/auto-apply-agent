import OpenAI from 'openai';
import profile from '../config/profile.json';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function evaluateJob(jobDescription: string, jobTitle: string, company: string) {
  const prompt = `
  Je bent een expert AI sollicitatie-assistent. Jouw taak is om te beoordelen of het profiel van de kandidaat past bij de vacature, en om een op maat gemaakte motivatiebrief en cv-bulletpoints te schrijven in het Nederlands.
  
  Functietitel: ${jobTitle}
  Bedrijf: ${company}
  Vacaturetekst: ${jobDescription}
  
  Profiel van de kandidaat:
  ${JSON.stringify(profile, null, 2)}
  
  Instructies:
  1. Bereken een match_score (0-100) gebaseerd op hoe goed de vaardigheden van de kandidaat (Support, SQL, Jira, M365) aansluiten bij de vacature.
  2. Schrijf een zeer gepersonaliseerde motivatiebrief van 3 alinea's in het Nederlands. 
     - Tone of voice: Professioneel, empathisch, rustig en oplossingsgericht.
     - Verwijs indien relevant naar ervaring bij Microsoft (klantcontact/stressbestendigheid) en Carfac (ERP/SQL/Jira/ontwikkelaars schakelen).
     - Vermijd clichés. Klink als een echt persoon.
  3. Genereer 3-4 CV bulletpoints in het Nederlands die specifiek zijn aangepast om de vaardigheden te benadrukken die dit bedrijf zoekt.
  
  Reageer in strict JSON formaat exact zoals dit:
  {
    "match_score": 85,
    "reasoning": "Sterke match op 1ste/2de lijns support en SQL, maar mist directe ervaring met hun specifieke software.",
    "cover_letter_draft": "Beste Hiring Manager...",
    "resume_bullets_draft": ["Fungeerde als 1ste aanspreekpunt voor ERP-gebruikers...", "Analyseerde database-fouten via SQL..."]
  }`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });

  return JSON.parse(response.choices[0].message.content || '{}');
}