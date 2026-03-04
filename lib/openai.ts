import Groq from 'groq-sdk';
import profile from '../config/profile.json';

// Initialize Groq client with the provided key (or via env var if set)
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || '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',
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
  
  Je MOET uitsluitend reageren met een geldig JSON object. Gebruik deze exacte structuur:
  {
    "match_score": 85,
    "reasoning": "Sterke match op Jira en SQL, echte support rol. Geen development vereist.",
    "cover_letter_draft": "Beste Hiring Manager...",
    "resume_bullets_draft": ["Ervaring met 1st en 2nd line support via Jira...", "Geavanceerde SQL troubleshooting in ERP systemen..."]
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
      model: "llama-3.3-70b-versatile", // Blazing fast Llama 3 model
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