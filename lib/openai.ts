import Groq from 'groq-sdk';
import profile from '../config/profile.json';

export async function evaluateJob(jobDescription: string, jobTitle: string, company: string) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set in environment variables.");
  }

  const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

  const prompt = `
  Je bent een expert AI job application assistent voor Jordy Berendsen.
  
  Jordy's Doel: Solliciteren voor IT Support / Helpdesk / Interne IT rollen, idealiter waar hij interne collega's/medewerkers kan helpen met hun IT problemen (hardware, M365, Jira, netwerk). Hij wil dé interne IT-held zijn die ervoor zorgt dat het bedrijf vlot draait.
  
  Vacature:
  Titel: ${jobTitle}
  Bedrijf: ${company}
  Beschrijving: ${jobDescription}
  
  Jordy's CV en Profiel:
  ${JSON.stringify(profile, null, 2)}
  
  INSTRUCTIES:
  1. Bereken een match_score (0-100). Geef een HOGERE score aan jobs die expliciet vermelden dat je interne medewerkers/collega's moet helpen (Internal IT, Service Desk). Geef een zware penalisatie (onder 40) voor pure software development.
  2. Bedenk een korte contextuele 'bedrijfskennis' zin (indien je de reputatie/sector van ${company} kent, verwijs hier subtiel naar).
  3. Schrijf een sterk gepersonaliseerde motivatiebrief van 3 alinea's in het NEDERLANDS. Gebruik een collegiale, empathische toon. Benadruk dat je het fantastisch vindt om collega's te ontzorgen van hun IT-problemen (zowel M365, hardware als tickets via Jira).
  4. Genereer 3-4 specifieke 'CV Bullet Points' in het NEDERLANDS die hij bovenaan zijn CV kan zetten, met focus op interne klantentevredenheid, ticketing, en 1st/2nd line support.
  
  Je MOET uitsluitend reageren met een geldig JSON object. Gebruik deze exacte structuur:
  {
    "match_score": 85,
    "reasoning": "Sterke match op Jira en M365. Het is een interne support rol, wat perfect aansluit bij je doelen.",
    "cover_letter_draft": "Beste Hiring Manager...",
    "resume_bullets_draft": ["Ervaring met 1st en 2nd line support via Jira...", "Gedreven om interne collega's vlot te helpen met IT-problemen..."]
  }`;

  try {
    const response = await groq.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: "You are an API that exclusively returns valid JSON objects. Never return markdown formatting or conversational text." 
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content || '{}';
    return JSON.parse(content);
  } catch (error) {
    console.error("Groq generation error:", error);
    return {
      match_score: 0,
      reasoning: "Error generating analysis via Groq.",
      cover_letter_draft: "Error generation failed.",
      resume_bullets_draft: []
    };
  }
}