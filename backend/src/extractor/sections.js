/**
 * extractor/sections.js
 *
 * Splits normalized GeM NIT PDF text into named section blocks.
 *
 * Strategy:
 *   • Scan lines top-to-bottom looking for known heading anchors.
 *   • Each section runs from its heading line to the line before
 *     the next detected heading.
 *   • Unknown text before the first heading is stored as PREAMBLE.
 *   • Returns a plain object keyed by section name.
 */

/**
 * Section heading definitions.
 * Order matters — first match wins.
 * Each entry: { key, patterns[] }
 *
 * Patterns are tested against the trimmed, lowercased line.
 * Multiple patterns per section handle heading variants across GeM PDF versions.
 */
const SECTION_ANCHORS = [
  {
    key: 'BID_DETAILS',
    patterns: [
      /^[^\w]*bid\s+detail/i,
      /^[^\w]*bid\s+information/i,
      /^[^\w]*basic\s+details/i,
    ],
  },
  {
    key: 'ITEM_DETAILS',
    patterns: [
      /^[^\w]*item\s+detail/i,
      /^[^\w]*item\s+category/i,
      /^[^\w]*product\s+detail/i,
    ],
  },
  {
    key: 'CONSIGNEE_DETAILS',
    patterns: [
      /^[^\w]*consignee\s+detail/i,
      /^[^\w]*delivery\s+detail/i,
      /^[^\w]*consignees?\/reporting\s+officer/i,
      /^[^\w]*consignees?\s*and\s*quantity/i,
    ],
  },
  {
    key: 'ELIGIBILITY_CRITERIA',
    patterns: [
      /^[^\w]*eligibility\s+criteria/i,
      /^[^\w]*eligibility\s+condition/i,
      /^[^\w]*seller\s+eligibility/i,
    ],
  },
  {
    key: 'PAST_PERFORMANCE',
    patterns: [
      /^[^\w]*(?:\d+[.)]\s*)?past\s+performance\s*(?:[:\-]\s*(?:The\s+Bidder|Bidder|Seller)|$)/i,
    ],
  },
  {
    key: 'FINANCIAL_CRITERIA',
    patterns: [
      /^[^\w]*(?:\d+[.)]\s*)?financial\s+criteria\s*(?:[:\-]\s*(?:The\s+Bidder|Bidder|Seller)|$)/i,
      /^[^\w]*financial\s+requirement/i,
    ],
  },
  {
    key: 'BUYER_ATC',
    patterns: [
      /^[^\w]*buyer\s+added\s+bid\s+specific/i,
      /^[^\w]*buyer\s+specific\s+terms/i,
      /^[^\w]*additional\s+terms\s+and\s+conditions/i,
      /^[^\w]*bid\s+specific\s+terms/i,
    ],
  },
  {
    key: 'UPLOADED_DOCS',
    patterns: [
      /^[^\w]*buyer\s+uploaded/i,
      /^[^\w]*uploaded\s+(atc\s+)?documents?\s*(?:by\s+buyer|$)/i,
      // NOTE: do NOT match "documents uploaded by bidders" — that is a bid form question
      /^[^\w]*buyer\s+added\s+documents/i,
    ],
  },
  {
    key: 'DISCLAIMER',
    patterns: [
      /^[^\w]*disclaimer/i,
    ],
  },
];

/**
 * detectSectionKey(line) → string | null
 *
 * Returns the section key if the line is a section heading, null otherwise.
 */
function detectSectionKey(line) {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return null;

  for (const { key, patterns } of SECTION_ANCHORS) {
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) return key;
    }
  }
  return null;
}

/**
 * splitSections(normalizedText) → { [sectionKey]: string }
 *
 * Returns a map of section name → section text (including heading line).
 * Sections not found in the PDF simply won't have a key.
 * A special key 'PREAMBLE' holds any text before the first heading.
 * A special key 'FULL_TEXT' always holds the full normalized text (for fallback use).
 */
export function splitSections(normalizedText) {
  const lines = normalizedText.split('\n');
  const sections = {};
  const sectionLines = {}; // key → line[]

  let currentKey = 'PREAMBLE';
  sectionLines[currentKey] = [];

  for (const line of lines) {
    const key = detectSectionKey(line);
    if (key) {
      currentKey = key;
      if (!sectionLines[key]) sectionLines[key] = [];
    }
    sectionLines[currentKey].push(line);
  }

  // Convert arrays to strings
  for (const [key, lineArr] of Object.entries(sectionLines)) {
    sections[key] = lineArr.join('\n').trim();
  }

  // Always expose full text for desperate fallback searches
  sections['FULL_TEXT'] = normalizedText;

  return sections;
}

/**
 * getSection(sections, key) → string
 * Safe accessor — returns '' if section not found.
 */
export function getSection(sections, key) {
  return sections[key] || '';
}

/**
 * getSectionLines(sections, key) → string[]
 * Returns lines of a section (non-empty lines only).
 */
export function getSectionLines(sections, key) {
  const text = getSection(sections, key);
  return text.split('\n').filter((l) => l.trim().length > 0);
}
