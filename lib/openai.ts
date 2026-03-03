import OpenAI from 'openai';
import profile from '../config/profile.json';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function evaluateJob(jobDescription: string, jobTitle: string, company: string) {
  const prompt = `
  You are an expert AI hiring assistant. Your job is to assess the fit between the candidate's profile and the job description, and draft tailored application materials.
  
  Job Title: ${jobTitle}
  Company: ${company}
  Job Description: ${jobDescription}
  
  Candidate Profile:
  ${JSON.stringify(profile, null, 2)}
  
  Instructions:
  1. Calculate a match_score (0-100) based on how well the candidate's core and contextual skills match the job description.
  2. Write a highly personalized 3-paragraph cover letter. Tone should be natural, confident, and specific. AVOID cliches like "passionate about" or "synergy". Sound like a real human.
  3. Generate 3-4 resume bullet points tailored specifically to emphasize the skills needed for this job, using the candidate's actual profile history.
  
  Respond in strict JSON format exactly like this:
  {
    "match_score": 85,
    "reasoning": "Strong match on React and TS, but lacking direct AWS experience.",
    "cover_letter_draft": "Dear Hiring Manager...",
    "resume_bullets_draft": ["Built responsive UI using React...", "Optimized PostgreSQL queries..."]
  }`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini", // Using mini for speed and cost efficiency
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });

  return JSON.parse(response.choices[0].message.content || '{}');
}