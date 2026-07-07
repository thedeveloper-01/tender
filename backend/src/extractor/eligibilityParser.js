/**
 * extractor/eligibilityParser.js
 *
 * Parses the ELIGIBILITY_CRITERIA section of a GeM NIT PDF into a structured object.
 *
 * Unlike fieldExtractor which uses the dictionary loop, this parser
 * handles the "Documents Required" multi-value list which needs
 * special line-scanning logic.
 *
 * Returns the eligibility object stored in aiExtract.eligibility (DB key).
 */

import { extractFields, extractDocumentsRequired } from './fieldExtractor.js';
import { cleanText } from './utils.js';

/**
 * parseEligibility(sections, fieldResults) → eligibility object
 *
 * sections:     result of splitSections()
 * fieldResults: already-extracted scalar fields from extractFields()
 *               (avoids re-running the same anchors)
 */
export function parseEligibility(sections, fieldResults) {
  // Scalar fields already extracted by fieldExtractor
  const eligibility = {
    minAnnualTurnover:          fieldResults.minAnnualTurnover          ?? null,
    oemAverageTurnover:         fieldResults.oemAverageTurnover         ?? null,
    yearsOfExperience:          fieldResults.yearsOfExperience          ?? null,
    mseExemption:               fieldResults.mseExemption               ?? null,
    startupExemption:           fieldResults.startupExemption           ?? null,
    msePurchasePreference:      fieldResults.msePurchasePreference      ?? null,
    miiPurchasePreference:      fieldResults.miiPurchasePreference      ?? null,
    technicalClarificationDays: fieldResults.technicalClarificationDays ?? null,
    inspectionRequired:         fieldResults.inspectionRequired         ?? null,
    pastPerformancePct:         fieldResults.pastPerformancePct         ?? null,
    evaluationMethod:           fieldResults.evaluationMethod           ?? null,
    arbitrationClause:          fieldResults.arbitrationClause          ?? null,
    mediationClause:            fieldResults.mediationClause            ?? null,
    typeOfBid:                  fieldResults.typeOfBid                  ?? null,
    // Multi-value list — needs dedicated scanner
    documentsRequired:          extractDocumentsRequired(sections),
  };

  // ── Financial Criteria (free text, if present in its own sub-section) ─────
  eligibility.financialCriteria = extractFinancialCriteria(sections);

  // ── Technical / Performance criteria (free text) ──────────────────────────
  eligibility.technicalCriteria = extractTechnicalCriteria(sections);

  return eligibility;
}

/**
 * extractFinancialCriteria(sections) → string | null
 *
 * Looks for financial criteria text in FINANCIAL_CRITERIA section,
 * then falls back to a search inside ELIGIBILITY_CRITERIA.
 */
function extractFinancialCriteria(sections) {
  const text = sections['FINANCIAL_CRITERIA'] || '';
  if (text) {
    // Skip the heading line
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const bodyLines = lines.slice(1); // first line = heading
    if (bodyLines.length > 0) return cleanText(bodyLines.join(' ')).slice(0, 500);
  }

  // Fallback: look for "Financial Criteria" inside eligibility section
  const eligText = sections['ELIGIBILITY_CRITERIA'] || '';
  const match = eligText.match(/Financial\s+Criteria[:\-]?\s*(.{10,300})/is);
  return match ? cleanText(match[1]).slice(0, 500) : null;
}

/**
 * extractTechnicalCriteria(sections) → string | null
 */
function extractTechnicalCriteria(sections) {
  const eligText = sections['ELIGIBILITY_CRITERIA'] || '';
  const match = eligText.match(/Technical\s+(?:Criteria|Specification)[:\-]?\s*(.{10,300})/is);
  return match ? cleanText(match[1]).slice(0, 500) : null;
}
