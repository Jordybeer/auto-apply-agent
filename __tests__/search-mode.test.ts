import { buildModePromptContext, SEARCH_MODES, MODE_LABELS } from '@/lib/search-mode';
import type { StudentJobPrefs, PivotPrefs } from '@/lib/search-mode';

const STUDENT: StudentJobPrefs = {
  max_hours_per_week: 20,
  flexible_schedule: true,
  sectors: ['horeca', 'retail'],
  student_status: 'hoger_onderwijs',
  availability_from: '2026-07-01',
};

const PIVOT: PivotPrefs = {
  target_sectors: ['IT', 'marketing'],
  transferable_skills: ['communicatie', 'projectbeheer'],
  open_to_retraining: true,
};

describe('SEARCH_MODES / MODE_LABELS', () => {
  it('exports three modes', () => {
    expect(SEARCH_MODES).toEqual(['career', 'student', 'pivot']);
  });

  it('has a label for every mode', () => {
    SEARCH_MODES.forEach(m => expect(MODE_LABELS[m]).toBeTruthy());
  });
});

describe('buildModePromptContext', () => {
  it('returns empty string for career mode', () => {
    expect(buildModePromptContext('career')).toBe('');
    expect(buildModePromptContext(undefined)).toBe('');
  });

  it('returns empty string for student mode without prefs', () => {
    expect(buildModePromptContext('student')).toBe('');
    expect(buildModePromptContext('student', null)).toBe('');
  });

  it('includes hours and flexibility for student mode', () => {
    const ctx = buildModePromptContext('student', STUDENT);
    expect(ctx).toContain('20');
    expect(ctx).toContain('flexibel');
  });

  it('includes sectors for student mode', () => {
    const ctx = buildModePromptContext('student', STUDENT);
    expect(ctx).toContain('horeca');
    expect(ctx).toContain('retail');
  });

  it('includes availability date for student mode', () => {
    const ctx = buildModePromptContext('student', STUDENT);
    expect(ctx).toContain('2026-07-01');
  });

  it('returns empty string for pivot mode without prefs', () => {
    expect(buildModePromptContext('pivot')).toBe('');
    expect(buildModePromptContext('pivot', null, null)).toBe('');
  });

  it('includes target sectors for pivot mode', () => {
    const ctx = buildModePromptContext('pivot', null, PIVOT);
    expect(ctx).toContain('IT');
    expect(ctx).toContain('marketing');
  });

  it('includes transferable skills for pivot mode', () => {
    const ctx = buildModePromptContext('pivot', null, PIVOT);
    expect(ctx).toContain('communicatie');
    expect(ctx).toContain('projectbeheer');
  });

  it('mentions omscholing when open_to_retraining is true', () => {
    const ctx = buildModePromptContext('pivot', null, PIVOT);
    expect(ctx.toLowerCase()).toContain('omscholing');
  });

  it('does not mention omscholing when open_to_retraining is false', () => {
    const ctx = buildModePromptContext('pivot', null, { ...PIVOT, open_to_retraining: false });
    expect(ctx.toLowerCase()).not.toContain('omscholing');
  });
});
