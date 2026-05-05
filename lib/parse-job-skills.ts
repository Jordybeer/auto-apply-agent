export interface ParsedJobSkills {
  required: string[];
  optional: string[];
  extracted_from: 'regex' | 'llm';
}

function normalizeSkill(skill: string): string {
  return skill
    .toLowerCase()
    .trim()
    .replace(/[^\w\s+#\.\-]/g, '')
    .slice(0, 50);
}

function extractByRegex(description: string): ParsedJobSkills | null {
  const lower = description.toLowerCase();
  const required = new Set<string>();
  const optional = new Set<string>();

  const requiredPatterns = [
    /(?:must have|required|essential|must know|require[sd]?)[:\s]+([^.\n]+)/gi,
    /(?:proficient in|expertise in|experienced with|strong [a-z\s]+experience in)[:\s]+([^.\n]+)/gi,
    /\b(?:java|python|javascript|typescript|react|angular|vue|node|express|django|flask|sql|postgresql|mongodb|docker|kubernetes|aws|azure|gcp|git|agile|scrum)\b/gi,
  ];

  const optionalPatterns = [
    /(?:preferred|nice-to-have|bonus|plus|helpful)[:\s]+([^.\n]+)/gi,
    /(?:knowledge of|familiarity with)[:\s]+([^.\n]+)/gi,
  ];

  for (const pattern of requiredPatterns) {
    let match;
    while ((match = pattern.exec(description)) !== null) {
      const text = match[1] || match[0];
      const skills = text
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 2 && s.length < 100);
      skills.forEach((s) => required.add(normalizeSkill(s)));
    }
  }

  for (const pattern of optionalPatterns) {
    let match;
    while ((match = pattern.exec(description)) !== null) {
      const text = match[1] || match[0];
      const skills = text
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 2 && s.length < 100);
      skills.forEach((s) => optional.add(normalizeSkill(s)));
    }
  }

  // If we found at least some skills, return the result
  if (required.size > 0 || optional.size > 0) {
    return {
      required: Array.from(required),
      optional: Array.from(optional),
      extracted_from: 'regex',
    };
  }

  return null;
}

async function extractByLLM(
  description: string,
): Promise<ParsedJobSkills> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return { required: [], optional: [], extracted_from: 'llm' };

  const truncated = description.slice(0, 3000);
  const prompt = `Extraheer ALLEEN skills/tools uit deze vacature. Splits in "required" en "optional".

<job_description>
${truncated}
</job_description>

Geef JSON:
{
  "required": ["skill1", "skill2"],
  "optional": ["preferred1", "preferred2"]
}

Alleen skills van max 50 chars. Korte namen (React, niet "React framework").`;

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: anthropicKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: 'Je extraheert skills uit vacatures. Geef ALLEEN JSON, geen tekst buiten JSON.',
      messages: [{ role: 'user', content: prompt }],
    });
    const content = msg.content[0].type === 'text' ? msg.content[0].text : '{}';
    const raw = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return {
      required: Array.isArray(raw.required)
        ? raw.required
            .filter((s: unknown) => typeof s === 'string')
            .map(normalizeSkill)
            .slice(0, 20)
        : [],
      optional: Array.isArray(raw.optional)
        ? raw.optional
            .filter((s: unknown) => typeof s === 'string')
            .map(normalizeSkill)
            .slice(0, 20)
        : [],
      extracted_from: 'llm',
    };
  } catch {
    return { required: [], optional: [], extracted_from: 'llm' };
  }
}

export async function parseJobSkills(
  description: string,
): Promise<ParsedJobSkills> {
  if (!description || description.trim().length < 100) {
    return { required: [], optional: [], extracted_from: 'regex' };
  }

  const regexResult = extractByRegex(description);
  if (regexResult && regexResult.required.length > 0) {
    return regexResult;
  }

  return extractByLLM(description);
}

export function scoreSkillMatch(
  cvSkills: string[],
  cvTools: string[],
  requiredSkills: string[],
  optionalSkills: string[],
): { score: number; required_covered: number; optional_covered: number; bullets: string[] } {
  const cvAll = [...cvSkills, ...cvTools].map((s) => normalizeSkill(s));
  const requiredNorm = requiredSkills.map(normalizeSkill);
  const optionalNorm = optionalSkills.map(normalizeSkill);

  // Helper to check if a CV skill matches a required skill (exact or fuzzy)
  const matches = (cvSkill: string, requiredSkill: string): boolean => {
    if (cvSkill === requiredSkill) return true;
    if (cvSkill.includes(requiredSkill) || requiredSkill.includes(cvSkill)) return true;
    // Handle abbreviations and variants
    if (
      (cvSkill === 'js' && requiredSkill === 'javascript') ||
      (cvSkill === 'typescript' && requiredSkill === 'ts') ||
      (cvSkill === 'python' && requiredSkill === 'py')
    ) {
      return true;
    }
    return false;
  };

  // Score required skills
  let requiredScore = 0;
  const requiredMatches = new Set<string>();
  for (const req of requiredNorm) {
    if (cvAll.some((cv) => matches(cv, req))) {
      requiredScore += 2;
      requiredMatches.add(req);
    }
  }

  // Score optional skills
  let optionalScore = 0;
  const optionalMatches = new Set<string>();
  for (const opt of optionalNorm) {
    if (cvAll.some((cv) => matches(cv, opt))) {
      optionalScore += 1;
      optionalMatches.add(opt);
    }
  }

  // Calculate percentages
  const requiredCovered =
    requiredNorm.length > 0 ? Math.round((requiredMatches.size / requiredNorm.length) * 100) : 100;
  const optionalCovered =
    optionalNorm.length > 0 ? Math.round((optionalMatches.size / optionalNorm.length) * 100) : 0;

  // Map scores to 0–25 point scale
  const maxScore = Math.min(25, requiredNorm.length * 2 + optionalNorm.length);
  const score = maxScore > 0 ? Math.min(25, Math.round(((requiredScore + optionalScore) / maxScore) * 25)) : 0;

  // Build bullets
  const bullets: string[] = [];
  if (requiredNorm.length > 0) {
    bullets.push(`Vereiste skills: ${requiredCovered}% aanwezig (${requiredMatches.size}/${requiredNorm.length})`);
  }
  if (optionalNorm.length > 0) {
    bullets.push(`Aanvullende skills: ${optionalCovered}% aanwezig (${optionalMatches.size}/${optionalNorm.length})`);
  }
  if (bullets.length === 0) {
    bullets.push('Skill-informatie niet beschikbaar in vacature');
  }

  return {
    score,
    required_covered: requiredCovered,
    optional_covered: optionalCovered,
    bullets,
  };
}
