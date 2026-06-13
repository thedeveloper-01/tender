import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const NUM = '([\\d,]+(?:\\.\\d+)?)';

/** Patterns for the core bid value / EMD fields. */
const VALUE_PATTERNS = [
  new RegExp(`Bid\\s*Value\\s*[:\\-]?\\s*(?:₹|Rs\\.?|INR)?\\s*${NUM}`, 'i'),
  new RegExp(`Estimated\\s*Value\\s*[:\\-]?\\s*(?:₹|Rs\\.?|INR)?\\s*${NUM}`, 'i'),
  new RegExp(`Total\\s*Value\\s*[:\\-]?\\s*(?:₹|Rs\\.?|INR)?\\s*${NUM}`, 'i'),
];

const EMD_PATTERNS = [
  new RegExp(`EMD\\s*(?:Amount)?\\s*[:\\-]?\\s*(?:₹|Rs\\.?|INR)?\\s*${NUM}`, 'i'),
  new RegExp(`Earnest\\s*Money\\s*Deposit\\s*[:\\-]?\\s*(?:₹|Rs\\.?|INR)?\\s*${NUM}`, 'i'),
];

/**
 * Additional commonly-useful tender fields extracted from the PDF text for
 * the "view more details" panel. Each entry: { key, label, regex }.
 * All values are returned as plain strings (not parsed further).
 */
const DETAIL_FIELD_PATTERNS = [
  { key: 'epbgPercentage', label: 'ePBG Percentage', regex: /ePBG\s*(?:Percentage)?\s*[:\-]?\s*([\d.]+\s*%?)/i },
  { key: 'bidOfferValidity', label: 'Bid Offer Validity (Days)', regex: /Bid\s*Offer\s*Validity[^:\n]*[:\-]?\s*(\d+)\s*(?:Days?)?/i },
  { key: 'deliveryPeriod', label: 'Delivery Period', regex: /Delivery\s*Period[^:\n]*[:\-]?\s*([^\n]{1,80})/i },
  { key: 'inspectionRequired', label: 'Inspection Required', regex: /Inspection\s*Required\s*[:\-]?\s*(Yes|No)/i },
  { key: 'mseExemption', label: 'MSE Exemption', regex: /MSE\s*Exemption[^:\n]*[:\-]?\s*([^\n]{1,40})/i },
  { key: 'startupExemption', label: 'Startup Exemption', regex: /Startup\s*Exemption[^:\n]*[:\-]?\s*([^\n]{1,40})/i },
  { key: 'pastPerformance', label: 'Past Performance', regex: /Past\s*Performance[^:\n]*[:\-]?\s*([^\n]{1,60})/i },
  { key: 'bidderTurnover', label: 'Bidder Turnover (Min.)', regex: /(?:Bidder\s*)?Turnover[^:\n]*[:\-]?\s*([^\n]{1,60})/i },
  { key: 'experienceCriteria', label: 'Experience Criteria', regex: /Experience\s*Criteria[^:\n]*[:\-]?\s*([^\n]{1,80})/i },
  { key: 'consigneeAddress', label: 'Consignee / Delivery Address', regex: /Consignee\s*Address[^:\n]*[:\-]?\s*([^\n]{1,120})/i },
  { key: 'paymentTerms', label: 'Payment Terms', regex: /Payment\s*Terms?[^:\n]*[:\-]?\s*([^\n]{1,100})/i },
  { key: 'splitPercentage', label: 'Splitting (%)', regex: /Splitting[^:\n]*[:\-]?\s*([^\n]{1,40})/i },
];

function parseNumber(str) {
  if (!str) return null;
  const num = Number(str.replace(/,/g, ''));
  return isNaN(num) ? null : num;
}

function firstMatch(text, patterns) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseNumber(m[1]);
  }
  return null;
}

/**
 * extractValueAndEmd(tender, pdfPath) -> {
 *   bidValue, emdAmount, status, extractedText, extractedFields
 * }
 *
 * - If tender.bidValue/emdAmount are already set (from listing data),
 *   status is "extracted" and the values are returned as-is.
 * - Otherwise runs pdf-parse on pdfPath and regex-matches known patterns.
 * - extractedFields holds additional details (ePBG %, delivery period, etc.)
 *   for the "view more details" panel, regardless of bidValue/EMD status.
 * - extractedText is a trimmed excerpt (first ~4000 chars) of the PDF text,
 *   useful as a fallback "raw details" view.
 */
export async function extractValueAndEmd(tender, pdfPath) {
  let bidValue = tender.bidValue ?? null;
  let emdAmount = tender.emdAmount ?? null;
  let status = bidValue != null || emdAmount != null ? 'extracted' : null;
  let extractedText = null;
  let extractedFields = {};

  if (!pdfPath || !fs.existsSync(pdfPath)) {
    return { bidValue, emdAmount, status: status || 'not_attempted', extractedText, extractedFields };
  }

  try {
    const buf = fs.readFileSync(pdfPath);
    const data = await pdfParse(buf);
    const text = data.text || '';
    extractedText = text.replace(/\s+/g, ' ').trim().slice(0, 4000);

    if (bidValue == null) bidValue = firstMatch(text, VALUE_PATTERNS);
    if (emdAmount == null) emdAmount = firstMatch(text, EMD_PATTERNS);

    for (const field of DETAIL_FIELD_PATTERNS) {
      const m = text.match(field.regex);
      if (m) extractedFields[field.key] = { label: field.label, value: m[1].trim() };
    }

    status = bidValue != null || emdAmount != null ? 'extracted' : 'not_found';
  } catch (e) {
    console.error('[extract] pdf-parse failed:', e.message);
    status = status || 'not_found';
  }

  return { bidValue, emdAmount, status, extractedText, extractedFields };
}
