/**
 * search-mode.ts
 * Pure helpers for job-search context switching.
 * No DB calls — safe to import in tests and server components.
 */

export type SearchMode = 'career' | 'student' | 'pivot';

export interface StudentJobPrefs {
  max_hours_per_week: number;   // 1-40
  flexible_schedule:  boolean;
  sectors:            string[];
  student_status:     'hoger_onderwijs' | 'secundair' | 'andere';
  availability_from:  string | null;  // ISO date string or null
}

export interface PivotPrefs {
  target_sectors:      string[];
  transferable_skills: string[];
  open_to_retraining:  boolean;
}

/** Score weight multipliers injected into the AI scoring prompt per mode. */
export interface ScoreWeights {
  career_match:     number;
  student_friendly: number;
  pivot_fit:        number;
}

const WEIGHTS: Record<SearchMode, ScoreWeights> = {
  career:  { career_match: 1.0, student_friendly: 0.0, pivot_fit: 0.0 },
  student: { career_match: 0.3, student_friendly: 1.0, pivot_fit: 0.0 },
  pivot:   { career_match: 0.4, student_friendly: 0.0, pivot_fit: 1.0 },
};

export function getScoreWeights(mode: SearchMode): ScoreWeights {
  return WEIGHTS[mode];
}

export const MODE_LABELS: Record<SearchMode, string> = {
  career:  'Loopbaan',
  student: 'Studentenjob',
  pivot:   'Sectorwissel',
};

export const MODE_DESCRIPTIONS: Record<SearchMode, string> = {
  career:  'Scoort op basis van jouw cv en ervaring.',
  student: 'Prioriteert flexibele, deeltijdse jobs die passen bij je studies.',
  pivot:   'Zoekt kansen in een nieuwe sector op basis van jouw overdraagbare skills.',
};

export const MODE_ICONS: Record<SearchMode, string> = {
  career:  '💼',
  student: '🎓',
  pivot:   '🔄',
};

/**
 * Builds the extra context block injected into Groq/Anthropic scoring prompts
 * when a non-career mode is active. Returns empty string for 'career'.
 */
export function buildModePromptContext(
  mode: SearchMode,
  studentPrefs?: StudentJobPrefs | null,
  pivotPrefs?: PivotPrefs | null,
): string {
  if (mode === 'career') return '';

  if (mode === 'student' && studentPrefs) {
    const sectors = studentPrefs.sectors.length
      ? `Voorkeurssectoren: ${studentPrefs.sectors.join(', ')}.`
      : '';
    return [
      '\n[ZOEKCONTEXT: STUDENTENJOB]',
      `De kandidaat zoekt een studentenjob (max ${studentPrefs.max_hours_per_week}u/week).`,
      studentPrefs.flexible_schedule ? 'Flexibel rooster is een vereiste.' : '',
      sectors,
      studentPrefs.availability_from
        ? `Beschikbaar vanaf ${studentPrefs.availability_from}.`
        : '',
      'Score hoger op jobs die deeltijds, studentvriendelijk of seizoensgebonden zijn.',
      'Score lager op jobs die voltijdse beschikbaarheid of jarenlange ervaring vereisen.',
    ].filter(Boolean).join(' ');
  }

  if (mode === 'pivot' && pivotPrefs) {
    const targets = pivotPrefs.target_sectors.length
      ? `Doelsectoren: ${pivotPrefs.target_sectors.join(', ')}.`
      : '';
    const skills = pivotPrefs.transferable_skills.length
      ? `Overdraagbare skills: ${pivotPrefs.transferable_skills.join(', ')}.`
      : '';
    return [
      '\n[ZOEKCONTEXT: SECTORWISSEL]',
      'De kandidaat wil van sector wisselen.',
      targets,
      skills,
      pivotPrefs.open_to_retraining
        ? 'De kandidaat staat open voor bijscholing.'
        : '',
      'Score hoger als de vacature overdraagbare skills waardeert of instappers verwelkomt.',
      'Negeer het ontbreken van sectorspecifieke ervaring tenzij het een harde vereiste is.',
    ].filter(Boolean).join(' ');
  }

  return '';
}
