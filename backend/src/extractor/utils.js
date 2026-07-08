/**
 * extractor/utils.js
 *
 * Shared helper functions for value parsing and text utilities.
 * Called by every parser module — no duplication of conversion logic.
 */

// ── Money ─────────────────────────────────────────────────────────────────────

/**
 * parseMoney("₹ 4,00,000") → 400000
 * parseMoney("32 Lakh")    → 3200000
 * parseMoney("1.5 Cr")     → 15000000
 * parseMoney(null)         → null
 */
export function parseMoney(str) {
  if (str == null || str === '') return null;
  const s = String(str).replace(/[₹Rs.,\s]/g, '');
  // Multiplier keywords (must check before stripping alpha)
  const crore = /cr(?:ore)?s?/i.test(str);
  const lakh  = /l(?:a(?:c|kh))?s?/i.test(str);
  const thou  = /k\b/i.test(str);
  const clean = s.replace(/[a-z]/gi, '').trim();
  let n = parseFloat(clean);
  if (isNaN(n)) return null;
  if (crore) n *= 10_000_000;
  else if (lakh) n *= 100_000;
  else if (thou) n *= 1_000;
  return Math.round(n * 100) / 100;
}

// ── Date ──────────────────────────────────────────────────────────────────────

/**
 * parseDate("12/07/2026") → "2026-07-12"
 * parseDate("12.07.2026") → "2026-07-12"
 * Supports DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 */
export function parseDate(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const dt = new Date(`${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}T00:00:00.000Z`);
    return isNaN(dt.getTime()) ? null : dt.toISOString().split('T')[0];
  }
  const dt = new Date(str);
  return isNaN(dt.getTime()) ? null : dt.toISOString().split('T')[0];
}

// ── Days ──────────────────────────────────────────────────────────────────────

/**
 * parseDays("30 Days")   → 30
 * parseDays("2 Months")  → 60
 * parseDays("1 Year")    → 365
 * parseDays("15")        → 15
 */
export function parseDays(str) {
  if (!str) return null;
  const s = String(str).trim();
  const m = s.match(/(\d+(?:\.\d+)?)\s*(day|month|week|year)?s?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const unit = (m[2] || 'day').toLowerCase();
  if (unit.startsWith('month')) n = Math.round(n * 30);
  else if (unit.startsWith('week')) n = Math.round(n * 7);
  else if (unit.startsWith('year')) n = Math.round(n * 365);
  return isNaN(n) ? null : n;
}

// ── Boolean ───────────────────────────────────────────────────────────────────

/**
 * parseBool("Yes")      → true
 * parseBool("No")       → false
 * parseBool("Exempted") → true
 * parseBool("NA")       → null
 */
export function parseBool(str) {
  if (str == null) return null;
  const s = String(str).trim().toLowerCase();
  if (['yes', 'true', 'exempted', 'applicable', '1', 'allowed'].includes(s)) return true;
  if (['no', 'false', 'not applicable', 'na', 'n/a', '0', 'not allowed'].includes(s)) return false;
  return null;
}

// ── Number ────────────────────────────────────────────────────────────────────

/**
 * parseNumber("15") → 15
 * parseNumber("1,500") → 1500
 */
export function parseNumber(str) {
  if (str == null || str === '') return null;
  const n = parseFloat(String(str).replace(/,/g, '').trim());
  return isNaN(n) ? null : n;
}

// ── Percent ───────────────────────────────────────────────────────────────────

/** parsePercent("20%") → 20 */
export function parsePercent(str) {
  if (!str) return null;
  const m = String(str).match(/([\d.]+)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

// ── Text ──────────────────────────────────────────────────────────────────────

/** Trim + collapse inner whitespace */
export function cleanText(str) {
  if (!str) return '';
  return String(str).trim().replace(/\s+/g, ' ');
}

// ── Anchor search ─────────────────────────────────────────────────────────────

/**
 * anchorSearch(lines, anchor, windowSize = 4, lookBehind = 2)
 *
 * Finds the first line containing `anchor` (case-insensitive).
 * Returns `lookBehind` lines BEFORE the anchor + the anchor line +
 * `windowSize` lines AFTER it, all joined as a string.
 *
 * lookBehind is crucial for GeM PDFs: pdftotext -layout places the value
 * on the right column of the FIRST row of a table cell, but the label
 * can wrap down to subsequent rows. So the value appears BEFORE the full
 * label text in the extracted stream.
 *
 * Returns '' if anchor is not found.
 */
export function anchorSearch(lines, anchor, windowSize = 4, lookBehind = 2) {
  const lowerAnchor = anchor.toLowerCase().replace(/\s+/g, ' ');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().replace(/\s+/g, ' ').includes(lowerAnchor)) {
      const start = Math.max(0, i - lookBehind);
      return lines.slice(start, i + 1 + windowSize).join('\n');
    }
  }
  return '';
}

// ── Type dispatcher ───────────────────────────────────────────────────────────

/**
 * convertValue(raw, type) → coerced value
 * Used by fieldExtractor to avoid a giant switch per field.
 */
export function convertValue(raw, type) {
  if (raw == null || raw === '') return null;
  switch (type) {
    case 'money':   return parseMoney(raw);
    case 'date':    return parseDate(raw);
    case 'days':    return parseDays(raw);
    case 'boolean': return parseBool(raw);
    case 'number':  return parseNumber(raw);
    case 'percent': return parsePercent(raw);
    case 'text':
    default:        return cleanText(raw);
  }
}
