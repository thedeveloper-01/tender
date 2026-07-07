/**
 * extractor/parser.js
 *
 * Main orchestrator for GeM NIT PDF extraction.
 *
 * Replaces aiExtract.js / aiExtractTender() with fully offline, deterministic
 * extraction. No API calls, no LLMs, no cost.
 *
 * Exported function signature is compatible with the old aiExtractTender():
 *   extractGemPdf(pdfPath) → { bidValue, emdAmount, status, extractedText, aiExtract, warnings }
 *
 * The `aiExtract` key name is kept for DB compatibility — the frontend and
 * MongoDB schema are unchanged.
 *
 * Pipeline:
 *   1. extractPdfText()     — layout-aware PDF extraction (pdftotext → pdf-parse)
 *   2. normalizePdfText()   — Unicode, Devanagari strip, whitespace
 *   3. splitSections()      — named section blocks
 *   4. extractFields()      — anchor + shape field extraction (dictionary-driven)
 *   5. parseConsignees()    — consignee table rows
 *   6. parseEligibility()   — eligibility structured object
 *   7. parseAtc()           — ATC numbered clauses
 *   8. parseUploadedDocs()  — uploaded document list
 *   9. validate()           — warnings array
 */

import { extractPdfText, isPdftotextAvailable } from './pdfExtract.js';
import { normalizePdfText } from './normalize.js';
import { splitSections } from './sections.js';
import { extractFields } from './fieldExtractor.js';
import { parseConsignees } from './consigneeParser.js';
import { parseEligibility } from './eligibilityParser.js';
import { parseAtc } from './atcParser.js';
import { parseUploadedDocs } from './uploadedDocsParser.js';
import { validate } from './validators.js';

// Log extraction method once at module load
let _methodLogged = false;

/**
 * extractGemPdf(pdfPath) → extract result
 *
 * Compatible with the old aiExtractTender() return shape:
 * {
 *   bidValue:      number | null,
 *   emdAmount:     number | null,
 *   status:        'extracted' | 'not_found' | 'scanned',
 *   extractedText: string | null,
 *   aiExtract:     object | null,   ← stored in sourceMeta.aiExtract in MongoDB
 *   warnings:      string[],
 * }
 */
export async function extractGemPdf(pdfPath) {
  // ── 1. Extract PDF text ────────────────────────────────────────────────────
  const { text: rawText, method, isScanned } = await extractPdfText(pdfPath);

  if (!_methodLogged) {
    console.log(`[extractor] PDF extraction method: ${method} ${isPdftotextAvailable() ? '(pdftotext available)' : '(pdftotext not found — using pdf-parse fallback)'}`);
    _methodLogged = true;
  }

  if (isScanned || !rawText || rawText.trim().length < 100) {
    return {
      bidValue:      null,
      emdAmount:     null,
      status:        'scanned',
      extractedText: null,
      aiExtract:     null,
      warnings:      [`Scanned or empty PDF — extraction skipped (method: ${method})`],
    };
  }

  // ── 2. Normalize ───────────────────────────────────────────────────────────
  const normalizedText = normalizePdfText(rawText);

  // ── 3. Split sections ──────────────────────────────────────────────────────
  const sections = splitSections(normalizedText);

  // ── 4. Field extraction (dictionary-driven) ────────────────────────────────
  const fields = extractFields(sections);

  // ── 5. Consignees (section-scoped table parser) ────────────────────────────
  const consignees = parseConsignees(sections);

  // ── 6. Eligibility (multi-value + scalar fields) ───────────────────────────
  const eligibility = parseEligibility(sections, fields);

  // ── 7. ATC clauses (section-scoped, keyword-categorized) ──────────────────
  const atc = parseAtc(sections);

  // ── 8. Uploaded documents ─────────────────────────────────────────────────
  const uploadedDocuments = parseUploadedDocs(sections);

  // ── 9. Assemble aiExtract object ───────────────────────────────────────────
  const aiExtract = {
    // Core fields
    bidNumber:               fields.bidNumber               ?? null,
    ministry:                fields.ministry                ?? null,
    department:              fields.department              ?? null,
    organisation:            fields.organisation            ?? null,
    office:                  fields.office                  ?? null,
    // Dates
    bidStartDate:            fields.bidStartDate            ?? null,
    bidEndDate:              fields.bidEndDate              ?? null,
    bidOpeningDate:          fields.bidOpeningDate          ?? null,
    // Bid meta
    bidType:                 fields.bidType                 ?? null,
    bidToRA:                 fields.bidToRA                 ?? null,
    bidOfferValidityDays:    fields.bidOfferValidityDays    ?? null,
    epbgRequired:            fields.epbgRequired            ?? null,
    // Financials (also returned top-level for pipeline compatibility)
    bidValue:                fields.bidValue                ?? null,
    emdAmount:               fields.emdAmount               ?? null,
    // Item
    itemCategory:            fields.itemCategory            ?? null,
    quantity:                fields.quantity                ?? null,
    totalQuantity:           fields.totalQuantity           ?? null,
    deliveryDays:            fields.deliveryDays            ?? null,
    primaryProductCategory:  fields.primaryProductCategory  ?? null,
    // Complex sections
    eligibility,
    consignees,
    atc,
    uploadedDocuments,
    // Meta
    _extractionMethod:       method,
    _isScanned:              isScanned,
    extractedAt:             new Date().toISOString(),
  };

  // ── 10. Validate ──────────────────────────────────────────────────────────
  const warnings = validate(aiExtract);
  aiExtract.warnings = warnings;

  // ── 11. Determine status ──────────────────────────────────────────────────
  const status = (aiExtract.bidValue != null || aiExtract.emdAmount != null)
    ? 'extracted'
    : 'not_found';

  // Trimmed raw text excerpt for the DB (existing pdfExtract.text field)
  const extractedText = normalizedText.replace(/\s+/g, ' ').trim().slice(0, 4000);

  if (warnings.length > 0) {
    console.warn(`[extractor] ${warnings.length} warning(s) for ${pdfPath}:`, warnings.join(' | '));
  }

  console.log(
    `[extractor] ✓ status=${status} bidValue=${aiExtract.bidValue} emd=${aiExtract.emdAmount} ` +
    `consignees=${consignees.length} atc=${atc.length} method=${method}`
  );

  return {
    bidValue:      aiExtract.bidValue,
    emdAmount:     aiExtract.emdAmount,
    status,
    extractedText,
    aiExtract,
    warnings,
  };
}
