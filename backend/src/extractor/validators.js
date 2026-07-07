/**
 * extractor/validators.js
 *
 * Post-extraction validation. Checks required fields and value sanity.
 *
 * Never throws. Returns an array of warning strings.
 * Empty array = extraction passed all checks.
 */

import { getRequiredKeys } from './fieldDictionary.js';

/**
 * validate(extracted) → string[]
 *
 * extracted: the full aiExtract object built by parser.js
 */
export function validate(extracted) {
  const warnings = [];

  // ── Required scalar fields ─────────────────────────────────────────────────
  const requiredKeys = getRequiredKeys();
  for (const key of requiredKeys) {
    if (extracted[key] == null || extracted[key] === '') {
      warnings.push(`Missing required field: ${key}`);
    }
  }

  // ── Bid number format ─────────────────────────────────────────────────────
  if (extracted.bidNumber && !/^GEM\//i.test(extracted.bidNumber)) {
    warnings.push(`bidNumber does not start with GEM/: "${extracted.bidNumber}"`);
  }

  // ── Date sanity ──────────────────────────────────────────────────────────
  if (extracted.bidStartDate && extracted.bidEndDate) {
    if (new Date(extracted.bidStartDate) > new Date(extracted.bidEndDate)) {
      warnings.push(`bidStartDate (${extracted.bidStartDate}) is after bidEndDate (${extracted.bidEndDate})`);
    }
  }

  // ── Financial sanity ─────────────────────────────────────────────────────
  if (extracted.bidValue != null && extracted.emdAmount != null) {
    if (extracted.emdAmount > extracted.bidValue) {
      warnings.push(`emdAmount (${extracted.emdAmount}) exceeds bidValue (${extracted.bidValue})`);
    }
  }

  // ── Consignee presence ────────────────────────────────────────────────────
  if (!extracted.consignees || extracted.consignees.length === 0) {
    warnings.push('No consignees extracted — CONSIGNEE_DETAILS section may be missing or malformed');
  }

  // ── Scanned PDF ──────────────────────────────────────────────────────────
  if (extracted._isScanned) {
    warnings.push('PDF appears to be a scanned image — text extraction unreliable');
  }

  return warnings;
}
