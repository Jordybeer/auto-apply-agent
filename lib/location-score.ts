/**
 * Location proximity bonus for jobs near Stabroek / Kapellen / Hoevenen.
 *
 * Returns a bonus between 0 and 10 (inclusive):
 *   10 → job is in Stabroek, Kapellen, or Hoevenen (direct keyword match)
 *    8 → Antwerp province neighbours: Ekeren, Brasschaat, Schoten, Wuustwezel, Essen, Kalmthout
 *    5 → Antwerpen city / province generic mention
 *    2 → rest of Belgium / Dutch-language area (BE/NL)
 *    0 → no recognisable location, foreign country, or remote-only
 *
 * The bonus is added on top of the AI match_score (0–100) and capped at 100.
 */

const TIER_10 = [
  'stabroek', 'kapellen', 'hoevenen',
];

const TIER_8 = [
  'ekeren', 'brasschaat', 'schoten', 'wuustwezel', 'essen', 'kalmthout',
  'merksem', 'wilmarsdonk', 'lillo',
];

const TIER_5 = [
  'antwerpen', 'antwerp', 'anvers',
  'provincie antwerpen', 'regio antwerpen',
];

const TIER_2 = [
  // Flemish provinces + cities
  'gent', 'ghent', 'bruges', 'brugge', 'mechelen', 'malines', 'leuven',
  'hasselt', 'genk', 'turnhout', 'herentals', 'mol',
  // General Belgian / Dutch-language markers
  'belgi', 'belgië', 'belgium', 'vlaander', 'flanders',
  'nederland', 'netherlands', 'dutch',
];

/**
 * Returns 0–10 location bonus based on the job location string and/or description.
 */
export function locationBonus(location: string | null | undefined, description?: string): number {
  const haystack = [location ?? '', description ?? ''].join(' ').toLowerCase();

  if (TIER_10.some((kw) => haystack.includes(kw))) return 10;
  if (TIER_8.some((kw)  => haystack.includes(kw))) return 8;
  if (TIER_5.some((kw)  => haystack.includes(kw))) return 5;
  if (TIER_2.some((kw)  => haystack.includes(kw))) return 2;
  return 0;
}
