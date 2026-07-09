import { CG_CITIES, CITY_ALIASES, STATE_DISTRICTS } from '../config.js';

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
 * Resolve a free-text location string (from GeM listings / PDF body text)
 * to a city/district, scoped by the state the tender was fetched under.
 *
 * GeM PDFs rarely carry reliable, structured location data, so this is a
 * best-effort text match against whatever address/body text we could pull
 * from the PDF (and any Solr location hints) — run AFTER we already know
 * which state the tender belongs to (from the state-scoped fetch/folder),
 * so we only match against that state's own district/city list. This
 * avoids false-positive matches across states (e.g. a "Raipur" in Uttar
 * Pradesh clashing with Chhattisgarh's "Raipur").
 *
 * @param {string} locationText - free text to search (title, address, PDF body, etc.)
 * @param {string} [state] - state name (any case) the tender was fetched under.
 *                            Defaults to Chhattisgarh for backward compatibility.
 */
export function resolveCityForGem(locationText, state) {
  if (!locationText) return 'Unspecified';

  const stateName = (state || 'Chhattisgarh').trim();
  const isCG = /chhattisgarh/i.test(stateName);
  const text = locationText.toLowerCase();

  // 1. PIN code check — only reliable for Chhattisgarh's dedicated 49xxxx map
  if (isCG) {
    const pinMatch = locationText.match(/\b(49\d{4})\b/);
    if (pinMatch) {
      const resolvedPinCity = resolveCityByPin(pinMatch[1]);
      if (resolvedPinCity) return resolvedPinCity;
    }
  }

  // 2. District/city list for the tender's own state (longest names first,
  //    so e.g. "East Godavari" matches before a bare "Godavari" would).
  const districtList = isCG
    ? CG_CITIES
    : STATE_DISTRICTS[stateName.toLowerCase()] || null;

  if (districtList) {
    const sorted = [...districtList].sort((a, b) => b.length - a.length);
    for (const city of sorted) {
      if (text.includes(city.toLowerCase())) return city;
    }
  }

  // 3. Alias / alternate-name match — Chhattisgarh-specific aliases only
  if (isCG) {
    for (const [alias, city] of Object.entries(CITY_ALIASES)) {
      if (text.includes(alias)) return city;
    }
  }

  return 'Unspecified';
}
