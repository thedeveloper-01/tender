/**
 * extractor/atcParser.js
 *
 * Parses the "Buyer Added Bid Specific Terms and Conditions" section
 * of a GeM NIT PDF.
 *
 * Section-scoped: only the BUYER_ATC section is parsed.
 * The Disclaimer section also contains numbered lists (1–14) — without
 * section isolation those would be incorrectly mistaken for ATC clauses.
 *
 * Returns:
 *   Array<{ number, category, summary, fullText }>
 *
 * Category is determined by keyword matching — deterministic, no AI.
 */

import { cleanText } from './utils.js';

// ── Category keyword map ──────────────────────────────────────────────────────
// Keys are category names. Values are keyword arrays (case-insensitive).
// First matching category wins.
const CATEGORY_KEYWORDS = {
  Warranty:        ['warrant', 'guarantee', 'defect', 'replacement', 'repair', 'liability period'],
  Packing:         ['pack', 'packaging', 'container', 'carton', 'label', 'marking'],
  'Sample Clause': ['sample', 'proto', 'pre-dispatch', 'inspection sample'],
  Certificates:    ['certificate', 'certifi', 'test report', 'type test', 'bis', 'iso', 'bureau'],
  Inspection:      ['inspect', 'quality check', 'acceptance test', 'qa', 'qc', 'third party'],
  'Service Support': ['service', 'after sale', 'amc', 'maintenance', 'support center', 'helpdesk'],
  Installation:    ['install', 'commission', 'erect', 'set up', 'site'],
  Testing:         ['testing', 'performance test', 'factory test', 'fat', 'sat'],
  Payment:         ['payment', 'invoice', 'billing', 'advance', 'milestone', 'lc', 'letter of credit'],
  Delivery:        ['deliver', 'dispatch', 'transit', 'freight', 'consignment', 'shipment'],
  OEM:             ['oem', 'original equipment', 'manufacturer', 'authoriz'],
  Financial:       ['financial', 'turnover', 'net worth', 'bank guarantee', 'bg', 'sd ', 'security deposit'],
  Eligibility:     ['eligible', 'qualification', 'experience', 'credential', 'empanel'],
  Technical:       ['technical', 'specification', 'drawing', 'standard', 'compliance', 'make'],
  Experience:      ['experience', 'past performance', 'similar work', 'completion certificate'],
  Generic:         ['general', 'applicable', 'terms and condition', 'as per gem'],
};

// ── Clause splitter ───────────────────────────────────────────────────────────

/**
 * parseAtc(sections) → clause[]
 *
 * section-scoped — only works inside BUYER_ATC.
 */
export function parseAtc(sections) {
  const text = sections['BUYER_ATC'] || '';
  if (!text) return [];

  const clauses = splitClauses(text);
  return clauses.map((c, idx) => categorizeClause(c, idx + 1));
}

/**
 * splitClauses(sectionText) → Array<{ rawNumber, rawText }>
 *
 * Splits text into numbered clauses.
 * Handles patterns like:
 *   "1. Clause text..."
 *   "1) Clause text..."
 *   "Clause 1: Clause text..."
 */
function splitClauses(text) {
  const lines = text.split('\n');
  const clauses = [];
  let current = null;

  // Pattern for clause start: line beginning with number
  const CLAUSE_START = /^(\d{1,2})[.)]\s+(.+)/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip section heading line
    if (/^Buyer\s+Added\s+Bid/i.test(trimmed)) continue;

    const match = trimmed.match(CLAUSE_START);
    if (match) {
      if (current) clauses.push(current);
      current = { rawNumber: parseInt(match[1], 10), rawText: match[2] };
    } else if (current) {
      // Continuation of current clause
      current.rawText += ' ' + trimmed;
    }
  }

  if (current) clauses.push(current);
  return clauses;
}

/**
 * categorizeClause(rawClause, fallbackNumber) → { number, category, summary, fullText }
 */
function categorizeClause(rawClause, fallbackNumber) {
  const { rawNumber, rawText } = rawClause;
  const fullText = cleanText(rawText);
  const lower = fullText.toLowerCase();

  // Keyword-based categorization — first match wins
  let category = 'Other';
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      category = cat;
      break;
    }
  }

  // Deterministic summary: first sentence, capped at 120 chars
  const firstSentence = fullText.split(/[.!?]/)[0].trim();
  const summary = firstSentence.length > 5
    ? firstSentence.slice(0, 120) + (firstSentence.length > 120 ? '…' : '')
    : fullText.slice(0, 120);

  return {
    number:   rawNumber ?? fallbackNumber,
    category,
    summary,
    fullText,
  };
}
