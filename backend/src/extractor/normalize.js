/**
 * extractor/normalize.js
 *
 * Pure text normalization applied once on raw PDF text.
 *
 * Critical context: GeM NIT PDFs are two-column machine-generated templates.
 * Left column = Hindi label (Devanagari), right column = English label + value.
 * pdftotext -layout keeps them roughly adjacent. pdf-parse stream order may
 * interleave them unpredictably.
 *
 * Step 0: Strip all Devanagari/Hindi characters — they appear ONLY as label
 * mirrors and never contain extractable values. Removing them cleans up the
 * anchor search windows so English regexes don't have to skip Unicode noise.
 *
 * Preserves line order and section boundaries.
 * Never destroys newlines — sections.js depends on them.
 */

/** Unicode normalization map — common PDF artifacts */
const UNICODE_MAP = [
  [/\u2019|\u2018|\u201A|\u201B/g, "'"],   // curly single quotes
  [/\u201C|\u201D|\u201E|\u201F/g, '"'],   // curly double quotes
  [/\u2013|\u2014|\u2015/g, '-'],           // em/en dashes
  [/\u2022|\u2023|\u25E6/g, '-'],           // bullets
  [/\u20B9/g, '₹'],                         // rupee sign variant
  [/\u00A0/g, ' '],                         // non-breaking space
  [/\r\n/g, '\n'],                          // Windows line endings
  [/\r/g, '\n'],                            // old Mac line endings
  [/\f/g, '\n'],                            // form feed
];

/**
 * normalizePdfText(rawText) → string
 *
 * 0. Strip Devanagari Unicode block (\u0900–\u097F) — Hindi label mirrors.
 * 1. Apply Unicode substitutions.
 * 2. Normalize tabs to spaces.
 * 3. Trim trailing whitespace per line.
 * 4. Collapse 3+ consecutive blank lines to 2.
 * 5. Collapse multiple spaces within a line (but NOT newlines).
 */
export function normalizePdfText(rawText) {
  if (!rawText) return '';

  let text = rawText;

  // Step 0: Strip Devanagari — Hindi labels in GeM PDFs are noise for English regex
  // Unicode block U+0900–U+097F covers all standard Devanagari characters.
  // Also strip the Vedic Extensions block U+1CD0–U+1CFF used by some PDF renderers.
  text = text.replace(/[\u0900-\u097F\u1CD0-\u1CFF]+/g, '');

  // Step 1: Apply Unicode map
  for (const [pattern, replacement] of UNICODE_MAP) {
    text = text.replace(pattern, replacement);
  }

  // Step 2: Tabs → spaces
  text = text.replace(/\t/g, '  ');

  // Step 3–5: Process line by line
  const lines = text.split('\n').map((line) => {
    let l = line.replace(/\s+$/, '');            // trim trailing whitespace
    l = l.replace(/([^\s]) {2,}/g, '$1 ');       // collapse inline runs of spaces
    return l;
  });

  // Collapse 3+ consecutive blank lines → 2 blank lines
  const collapsed = [];
  let blankRun = 0;
  for (const line of lines) {
    if (line.trim() === '') {
      blankRun++;
      if (blankRun <= 2) collapsed.push(line);
    } else {
      blankRun = 0;
      collapsed.push(line);
    }
  }

  return collapsed.join('\n');
}

/**
 * textToLines(normalizedText) → string[]
 * Splits on newlines and returns non-empty lines.
 * Keeps order. Used by parsers that work line-by-line.
 */
export function textToLines(normalizedText) {
  return normalizedText.split('\n').filter((l) => l.trim().length > 0);
}
