/**
 * extractor/fieldExtractor.js
 *
 * Iterates FIELD_DICTIONARY and extracts every field using anchor-scoped
 * window search + optional shape validation.
 *
 * Per-field flow:
 *   1. Get the section text (from sections.js splitSections result).
 *   2. Find the anchor phrase in that section.
 *   3. Grab the next `window` lines as the search window.
 *   4. Run field.regex on the window to capture the raw value.
 *   5. If field.shape is defined, test the captured group against it.
 *      If shape fails → discard and continue to fallback.
 *   6. Convert via convertValue(raw, field.type) from utils.js.
 *   7. If anchor not found in section → retry on FULL_TEXT.
 *
 * No per-field logic. Adding a field = adding one object to fieldDictionary.js.
 */

import { FIELD_DICTIONARY } from './fieldDictionary.js';
import { anchorSearch, convertValue, cleanText } from './utils.js';

/**
 * extractFields(sections) → { [key]: value }
 *
 * sections: return value of splitSections() from sections.js
 */
export function extractFields(sections) {
  const result = {};

  for (const field of FIELD_DICTIONARY) {
    const { key, section, anchor, regex, shape, type, window: win = 3 } = field;

    if (result[key] !== undefined && result[key] !== null) {
      continue;
    }

    // 1. Try designated section
    let value = extractInSection(sections[section] || '', anchor, regex, shape, type, win);

    // 2. Fallback: full text (only if section search failed)
    if (value === null && sections['FULL_TEXT']) {
      value = extractInSection(sections['FULL_TEXT'], anchor, regex, shape, type, win);
    }

    result[key] = value;
  }

  return result;
}

/**
 * extractInSection(sectionText, anchor, regex, shape, type, windowSize) → value | null
 */
function extractInSection(sectionText, anchor, regex, shape, type, windowSize) {
  if (!sectionText) return null;

  const lines = sectionText.split('\n');

  // ── Anchor window search ───────────────────────────────────────────────────
  const windowText = anchorSearch(lines, anchor, windowSize);
  if (windowText) {
    const val = tryExtract(windowText, regex, shape, type);
    if (val !== null) return val;
  }

  // ── Direct regex on full section (label + value on same line) ─────────────
  const val = tryExtract(sectionText, regex, shape, type);
  return val;
}

/**
 * tryExtract(text, regex, shape, type) → converted value | null
 *
 * Runs regex, validates shape, converts type.
 * Returns null if regex misses or shape fails.
 */
function tryExtract(text, regex, shape, type) {
  // Reset lastIndex for global regexes
  if (regex.global) regex.lastIndex = 0;

  const match = regex.exec(text);
  if (!match || !match[1]) return null;

  const raw = cleanText(match[1]);
  if (!raw) return null;

  // Shape validation — prevents false captures from adjacent wrapped labels
  if (shape && !shape.test(raw)) return null;

  const converted = convertValue(raw, type);
  return converted !== null && converted !== '' ? converted : null;
}

/**
 * extractDocumentsRequired(sections) → string[]
 *
 * Extracts the "Required Documents" / "Documents Required" bullet list from
 * ELIGIBILITY_CRITERIA. Returns array of document name strings.
 *
 * Uses a line-scanning approach because it's a multi-value list,
 * not a single-value anchor match.
 */
export function extractDocumentsRequired(sections) {
  const text = sections['ELIGIBILITY_CRITERIA'] || sections['FULL_TEXT'] || '';
  if (!text) return [];

  const lines = text.split('\n');
  const docs = [];
  let inDocList = false;
  let blanksSeen = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect start of documents list
    if (!inDocList && /(?:required|mandatory)\s+documents?/i.test(line)) {
      inDocList = true;
      continue;
    }

    if (inDocList) {
      if (line === '') {
        blanksSeen++;
        if (blanksSeen > 1) break;  // two consecutive blanks = end of list
        continue;
      }
      blanksSeen = 0;

      // Hard stop on next section heading
      if (/^(?:Buyer|Eligibility|Consignee|Past\s+Performance|Disclaimer)/i.test(line)) break;

      // List items: numbered, bulleted, or plain lines
      const itemMatch = line.match(/^(?:\d+[.)]\s*|-\s*|\*\s*|[•►]\s*)(.+)/);
      if (itemMatch) {
        docs.push(cleanText(itemMatch[1]));
      } else if (line.length > 3 && line.length < 150) {
        docs.push(cleanText(line));
      }
    }
  }

  return docs;
}
