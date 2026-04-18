import { GROQ_MODEL, callGroq } from '@/lib/groq';

export interface CvStructured {
  skills: string[];
  tools: string[];
  languages: string[];
  experience_summary: string;
  experience_years: number | null;
  education: string;
  job_titles: string[];
}

const EMPTY: CvStructured = {
  skills: [],
  tools: [],
  languages: [],
  experience_summary: '',
  experience_years: null,
  education: '',
  job_titles: [],
};

export async function extractStructuredCv(
  rawText: string,
  groqApiKey?: string,
): Promise<CvStructured> {
  if (!rawText || rawText.trim().length < 50) return EMPTY;

  const prompt = `Extraheer de volgende velden uit dit CV. Geef uitsluitend geldige JSON terug.

<user_input>
${rawText.slice(0, 6000)}
</user_input>

{
  "skills": ["vaardigheid 1", "vaardigheid 2"],
  "tools": ["tool/software 1", "tool 2"],
  "languages": ["Nederlands (moedertaal)", "Engels (vloeiend)"],
  "experience_summary": "Korte samenvatting van werkervaring in 2-3 zinnen",
  "experience_years": 5,
  "education": "Hoogst behaalde diploma + richting",
  "job_titles": ["Meest recente functietitel", "Vorige functie"]
}`;

  try {
    const response = await callGroq({
      messages: [
        { role: 'system', content: 'Je extraheert gestructureerde data uit CVs. Alleen JSON, geen markdown.' },
        { role: 'user', content: prompt },
      ],
      model: GROQ_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      stream: false,
    }, groqApiKey);

    const raw = JSON.parse(response.choices[0]?.message?.content || '{}');

    return {
      skills:             Array.isArray(raw.skills) ? raw.skills.filter((s: unknown) => typeof s === 'string') : [],
      tools:              Array.isArray(raw.tools) ? raw.tools.filter((s: unknown) => typeof s === 'string') : [],
      languages:          Array.isArray(raw.languages) ? raw.languages.filter((s: unknown) => typeof s === 'string') : [],
      experience_summary: typeof raw.experience_summary === 'string' ? raw.experience_summary.slice(0, 500) : '',
      experience_years:   typeof raw.experience_years === 'number' ? raw.experience_years : null,
      education:          typeof raw.education === 'string' ? raw.education.slice(0, 200) : '',
      job_titles:         Array.isArray(raw.job_titles) ? raw.job_titles.filter((s: unknown) => typeof s === 'string') : [],
    };
  } catch {
    return EMPTY;
  }
}
