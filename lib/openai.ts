import OpenAI from 'openai';
import profile from '../config/profile.json';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function evaluateJob(jobDescription: string, jobTitle: string, company: string) {
  const prompt = `
  Je bent een expert AI job application assistent voor Jordy Berendsen.
  
  Jordy's Doel: Solliciteren voor IT Support / Front-end Developer rollen, idealiter in de zorgsector of SaaS, waar zijn combinatie van 1st/2nd line support (SQL/Jira) en web development van pas komt.
  
  Vacature:
  Titel: ${jobTitle}
  Bedrijf: ${company}
  Beschrijving: ${jobDescription}
  
  Jordy's CV en Profiel:
  ${JSON.stringify(profile, null, 2)}
  
  INSTRUCTIES:
  1. Bereken een match_score (0-100) op basis van de overlap tussen de vacature en Jordy's skills.
  2. Bedenk een korte contextuele 'bedrijfskennis' zin (indien je de reputatie/sector van ${company} kent, verwijs hier subtiel naar. Bv: "Gezien jullie sterke groei in de medische software...").
  3. Schrijf een sterk gepersonaliseerde motivatiebrief van 3 alinea's in het NEDERLANDS. Gebruik een professionele, empathische toon zonder AI-clichés zoals "Ik ben gepassioneerd over" of "synergie". Verwijs naar zijn Carfac of Microsoft ervaring indien relevant voor deze specifieke rol.
  4. Genereer 3-4 specifieke 'CV Bullet Points' in het NEDERLANDS die hij bovenaan zijn CV kan zetten voor deze specifieke vacature, waarbij je zijn skills uitlicht die in de vacature gevraagd worden.
  
  Antwoord MOET in dit strikte JSON formaat zijn:
  {
    "match_score": 85,
    "reasoning": "Sterke match op Jira en SQL, maar mist specifieke Azure AD ervaring.",
    "cover_letter_draft": "Beste Hiring Manager...",
    "resume_bullets_draft": ["Ervaring met 1st en 2nd line support via Jira...", "Geavanceerde SQL troubleshooting..."]
  }`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini", // Very fast, cheap, and handles Dutch perfectly
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });

  return JSON.parse(response.choices[0].message.content || '{}');
}