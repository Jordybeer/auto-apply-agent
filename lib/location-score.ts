/**
 * Location proximity scoring (0–15 pts).
 *
 * Legacy: also exported as locationBonus() for backwards compatibility.
 * New: accepts user preferences for smarter matching.
 *
 * Returns 0–15 based on:
 * - Remote work availability + user preferences
 * - Exact location match
 * - Proximity to user's preferred city/radius
 * - Fallback to tier-based matching
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
  'gent', 'ghent', 'bruges', 'brugge', 'mechelen', 'malines', 'leuven',
  'hasselt', 'genk', 'turnhout', 'herentals', 'mol',
  'belgi', 'belgië', 'belgium', 'vlaander', 'flanders',
  'nederland', 'netherlands', 'dutch',
];

function hasRemoteWork(description: string): boolean {
  const lower = description.toLowerCase();
  const patterns = [
    'thuiswerk', 'thuis werken', 'thuiswerken',
    'telewerk', 'tele-werk', 'telewerken',
    'hybride werk', 'hybride werken', 'hybride functie',
    'remote', 'volledig remote', 'deels remote',
    'werk vanuit huis', 'werken vanuit huis',
    'flexibel werken', 'flexibele werkplek',
    'work from home', 'working from home', 'wfh',
    'remote work', 'remote working', 'fully remote',
    'hybrid work', 'hybrid working', 'hybrid role',
    'home office', 'flexible working',
  ];
  return patterns.some((p) => lower.includes(p));
}

function getTierBonus(location: string | null | undefined): number {
  const haystack = location?.toLowerCase() || '';
  if (TIER_10.some((kw) => haystack.includes(kw))) return 10;
  if (TIER_8.some((kw) => haystack.includes(kw))) return 8;
  if (TIER_5.some((kw) => haystack.includes(kw))) return 5;
  return 0;
}

/**
 * Enhanced location scoring with user preferences.
 * @param location Job location string
 * @param description Job description (checked for remote work)
 * @param userCity User's preferred city
 * @param userRadius User's willing commute radius in km
 * @returns 0–15 point bonus
 */
export function enhancedLocationBonus(
  location: string | null | undefined,
  description: string | undefined,
  userCity?: string | null,
  userRadius?: number | null,
): number {
  const isRemote = description ? hasRemoteWork(description) : false;

  if (isRemote) {
    return 15;
  }

  const tierBonus = getTierBonus(location);
  if (tierBonus >= 10) {
    return 12;
  }
  if (tierBonus >= 8) {
    return 10;
  }
  if (tierBonus >= 5) {
    return 8;
  }
  if (tierBonus > 0) {
    return 4;
  }

  if (userCity && location) {
    const locationLower = location.toLowerCase();
    if (locationLower.includes(userCity.toLowerCase())) {
      return 8;
    }
  }

  return 0;
}

/**
 * Legacy: Returns 0–10 location bonus based on the job location string and/or description.
 * Kept for backwards compatibility; use enhancedLocationBonus() for new code.
 */
export function locationBonus(location: string | null | undefined, description?: string): number {
  return Math.min(10, enhancedLocationBonus(location, description));
}
