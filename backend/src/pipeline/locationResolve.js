import { CG_CITIES, CITY_ALIASES } from '../config.js';

/** CSPGCL plant-level location rules (ported from src/lib/plants.js) */
const CSPGCL_LOCATION_RULES = [
  { label: 'Korba', patterns: [/korba\s*west/i, /korba\s*east/i, /\bhtps\b/i, /hasdeo/i, /\bdspm/i, /\bktps\b/i] },
  { label: 'Janjgir-Champa', patterns: [/marwa/i, /\babvtps\b/i, /tendubhata/i, /janjgir/i] },
  { label: 'Raipur', patterns: [/raipur/i] },
];

/**
 * Resolve a CSPGCL tender's city using plant-level metadata first,
 * falling back to text-based pattern matching (ported from
 * resolveTenderLocation / detectTenderLocation in plants.js).
 */
export function resolveCityForCspgcl(record) {
  const plantLocationCity = {
    central: null,
    'korba-west': 'Korba',
    dspm: 'Korba',
    marwa: 'Janjgir-Champa',
  }[record.plantId];

  if (plantLocationCity) return plantLocationCity;

  const haystack = `${record.scopeRaw || ''} ${record.tenderNoticeNo || ''} ${record.issuingOffice || ''}`.toLowerCase();
  for (const { label, patterns } of CSPGCL_LOCATION_RULES) {
    if (patterns.some((p) => p.test(haystack))) return label;
  }
  return 'Unspecified';
}

/**
 * Map a 6-digit PIN code to a Chhattisgarh district.
 */
export function resolveCityByPin(pin) {
  // Specific 6-digit PIN overrides for high precision
  const exactMap = {
    '494553': 'Dantewada', // Kirandul NMDC
    '494556': 'Dantewada', // Bacheli NMDC
    '494226': 'Kondagaon',
    '495689': 'Sakti',
    '495677': 'Korba',
    '493445': 'Dhamtari',  // Kurud
    '493776': 'Dhamtari',
    '493449': 'Mahasamund',
    '493996': 'Gariaband', // Kosambuda
    '497229': 'Surajpur',
    '497331': 'Manendragarh-Chirmiri-Bharatpur',
  };

  if (exactMap[pin]) return exactMap[pin];

  // Prefix matching
  const p4 = pin.substring(0, 4);
  const p3 = pin.substring(0, 3);

  // 4-digit prefix rules
  const prefix4Map = {
    '4910': 'Durg',
    '4913': 'Bemetara',
    '4914': 'Rajnandgaon',
    '4915': 'Balod',
    '4916': 'Rajnandgaon',
    '4931': 'Raipur',
    '4932': 'Raipur',
    '4934': 'Mahasamund',
    '4935': 'Mahasamund',
    '4936': 'Dhamtari',
    '4937': 'Dhamtari',
    '4938': 'Dhamtari',
    '4939': 'Gariaband',
    '4944': 'Dantewada',
    '4945': 'Dantewada',
    '4946': 'Kanker',
    '4947': 'Kanker',
    '4955': 'Janjgir-Champa',
    '4972': 'Surajpur',
    '4973': 'Manendragarh-Chirmiri-Bharatpur',
    '4974': 'Manendragarh-Chirmiri-Bharatpur',
  };

  if (prefix4Map[p4]) return prefix4Map[p4];

  // 3-digit prefix rules
  const prefix3Map = {
    '490': 'Durg',
    '492': 'Raipur',
    '493': 'Raipur',
    '494': 'Bastar',
    '495': 'Bilaspur',
    '496': 'Raigarh',
    '497': 'Surguja',
  };

  return prefix3Map[p3] || null;
}

/**
 * Resolve a free-text location string (from GeM listings) to one of the
 * 33 CG districts via case-insensitive substring / alias matching.
 */
export function resolveCityForGem(locationText) {
  if (!locationText) return 'Unspecified';

  // 1. Try extracting and matching 6-digit PIN code
  const pinMatch = locationText.match(/\b(49\d{4})\b/);
  if (pinMatch) {
    const resolvedPinCity = resolveCityByPin(pinMatch[1]);
    if (resolvedPinCity) return resolvedPinCity;
  }

  const text = locationText.toLowerCase();

  // 2. Direct district name match (handles multi-word names like "Baloda Bazar" and Balod substring collision)
  // Sort cities by length descending to match longer names first
  const sortedCities = [...CG_CITIES].sort((a, b) => b.length - a.length);
  for (const city of sortedCities) {
    const cityLower = city.toLowerCase();
    
    // For Korea CG district, prevent false positives from Korea country origins
    if (cityLower === 'korea') {
      if (/\b(south\s+korea|korean|made\s+in\s+korea|origin\s*:?\s*korea|import\w*\s+from\s+korea)\b/i.test(text)) {
        continue;
      }
    }
    
    const escaped = city.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(text)) return city;
  }

  // 3. Alias / alternate-name match
  // Sort aliases by length descending
  const sortedAliases = Object.keys(CITY_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of sortedAliases) {
    const city = CITY_ALIASES[alias];
    const aliasLower = alias.toLowerCase();
    
    if (aliasLower === 'koriya') {
      if (/\b(south\s+korea|korean|made\s+in\s+korea|origin\s*:?\s*korea|import\w*\s+from\s+korea)\b/i.test(text)) {
        continue;
      }
    }
    
    const escaped = alias.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(text)) return city;
  }

  return 'Unspecified';
}
