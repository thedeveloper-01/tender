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
 * Resolve a free-text location string (from GeM listings) to one of the
 * 33 CG districts via case-insensitive substring / alias matching.
 */
export function resolveCityForGem(locationText) {
  if (!locationText) return 'Unspecified';
  const text = locationText.toLowerCase();

  // Direct district name match (handles multi-word names like "Baloda Bazar")
  for (const city of CG_CITIES) {
    if (text.includes(city.toLowerCase())) return city;
  }

  // Alias / alternate-name match
  for (const [alias, city] of Object.entries(CITY_ALIASES)) {
    if (text.includes(alias)) return city;
  }

  return 'Unspecified';
}
