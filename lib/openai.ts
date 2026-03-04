import OpenAI from 'openai';
import profile from '../config/profile.json';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function evaluateJob(jobDescription: string, jobTitle: string, company: string) {
  const prompt = `
  Je bent een expert AI job application assistent voor Jordy Berendsen.
  
  Jordy's Doel: Solliciteren voor IT Support / Software Support / Customer Support Engineer rollen, idealiter in de zorgsector of SaaS, waar zijn 1st/2nd line support ervaring (SQL/Jira/ERP) van pas komt. Hij zoekt GEEN development of programmeer rollen.
  
  Vacature:
  Titel: ${jobTitle}
  Bedrijf: ${company}
  Beschrijving: ${jobDescription}
  
  Jordy's CV en Profiel:
  ${JSON.stringify(profile, null, 2)}
  
  INSTRUCTIES:
  1. Bereken een match_score (0-100) op basis van de overlap tussen de vacature en Jordy's IT Support skills. Geef een zware penalisatie (score onder 40) als de rol pure software development of programmeren vereist.
  2. Bedenk een korte contextuele 'bedrijfskennis' zin (indien je de reputatie/sector van ${company} kent, verwijs hier subtiel naar).
  3. Schrijf een sterk gepersonaliseerde motivatiebrief van 3 alinea's in het NEDERLANDS. Gebruik een professionele, empathische toon. Verwijs naar zijn Carfac of Microsoft ervaring als support engineer.
  4. Genereer 3-4 specifieke 'CV Bullet Points' in het NEDERLANDS die hij bovenaan zijn CV kan zetten voor deze specifieke vacature, met focus op ticketing, SQL, en klantgerichtheid.
  
  Antwoord MOET in dit strikte JSON formaat zijn:
  {
    "match_score": 85,
    "reasoning": "Sterke match op Jira en SQL, echte support rol. Geen development vereist.",
    "cover_letter_draft": "Beste Hiring Manager...",
    "resume_bullets_draft": ["Ervaring met 1st en 2nd line support via Jira...", "Geavanceerde SQL troubleshooting in ERP systemen..."]
  }`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });

  return JSON.parse(response.choices[0].message.content || '{}');
}