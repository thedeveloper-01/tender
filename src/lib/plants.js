/** CSPGCL tender portal — Central Offices + one page per power station. */
export const PLANTS = [
  {
    id: 'central',
    paramflag: 1,
    label: 'Central Offices',
    shortLabel: 'Central Offices',
    locationLabel: null,
  },
  {
    id: 'korba-west',
    paramflag: 2,
    label: 'Hasdeo TPS — Korba West',
    shortLabel: 'Korba West',
    locationLabel: 'Korba West',
  },
  {
    id: 'dspm',
    paramflag: 3,
    label: 'Dr. Shyama Prasad Mukharjee TPS',
    shortLabel: 'DSPM',
    locationLabel: 'Korba East',
  },
  {
    id: 'marwa',
    paramflag: 5,
    label: 'Marwa Tendubhata TPS',
    shortLabel: 'Marwa',
    locationLabel: 'Marwa',
  },
];

const LOCATION_RULES = [
  { label: 'Korba West', patterns: [/korba\s*west/i, /\bhtps\b/i, /hasdeo/i] },
  { label: 'Korba East', patterns: [/korba\s*east/i, /\bdspm/i, /\bktps\b/i] },
  { label: 'Marwa', patterns: [/marwa/i, /\babvtps\b/i, /tendubhata/i, /janjgir/i] },
  { label: 'Raipur', patterns: [/raipur/i] },
];

/** Derive a site/location label from tender text (used for Central Offices tenders). */
export function detectTenderLocation(text = '') {
  const haystack = text.toLowerCase();
  for (const { label, patterns } of LOCATION_RULES) {
    if (patterns.some(p => p.test(haystack))) return label;
  }
  return 'Unspecified';
}

export function resolveTenderLocation(tender, plant) {
  if (plant?.locationLabel) return plant.locationLabel;
  const text = `${tender.scope_raw || ''} ${tender.tender_notice_no || ''} ${tender.issuing_office || ''}`;
  return detectTenderLocation(text);
}

export function isTenderActive(closingDate) {
  if (!closingDate) return true;
  const closing = new Date(closingDate);
  if (isNaN(closing.getTime())) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  closing.setHours(0, 0, 0, 0);
  return closing >= today;
}
