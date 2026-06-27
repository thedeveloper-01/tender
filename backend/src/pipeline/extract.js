import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { extractCspgclPdf } from './cspgcl_extract.js';

const NUM = '(\\d[\\d,]*(?:\\.\\d+)?)';

/**
 * GeM PDFs are bilingual (Hindi + English) — the English label and its value
 * are often concatenated with NO separator, e.g.:
 *   "ईएमड\u0013 रािश/EMD Amount800000"
 *   "ePBG Percentage(%)3.00"
 * We match the English portion only, allowing for optional separators.
 */
const VALUE_PATTERNS = [
  new RegExp(`Estimated\\s*(?:Bid\\s*)?Value[^\\d\\n]{0,30}${NUM}`, 'i'),
  new RegExp(`Estimated\\s*(?:Bid\\s*)?Value[^\\d]{0,120}${NUM}`, 'i'),
  new RegExp(`Total\\s*Value[^\\d\\n\\w]{0,15}${NUM}`, 'i'),
];

const EMD_PATTERNS = [
  new RegExp(`(?:EMD|ईएमड|Earnest\\s*Money)[\\s\\S]{0,100}?(?:Amount|रािश|Deposit)?[^\\d\\n]{0,30}${NUM}`, 'i'),
  new RegExp(`(?:EMD|ईएमड|Earnest\\s*Money)[\\s\\S]{0,120}?(?:Amount|रािश|Deposit)?[^\\d]{0,100}${NUM}`, 'i'),
];

/**
 * Additional commonly-useful tender fields extracted from the PDF text for
 * the "view more details" panel. Each entry: { key, label, regex }.
 * All values are returned as plain strings (not parsed further).
 */
const DETAIL_FIELD_PATTERNS = [
  // ePBG Percentage: "ePBG Percentage(%)3.00" — value directly after label
  { key: 'epbgPercentage', label: 'ePBG Percentage', regex: /ePBG\s*(?:Percentage)?[^\d\n]{0,10}?([\d.]+)\s*%?/i },
  // Bid Offer Validity: "Validity (From End Date)\n180 (Days)" — value on next line
  { key: 'bidOfferValidity', label: 'Bid Offer Validity (Days)', regex: /Bid\s*Offer\s*Validity[\s\S]{0,40}?\n(\d+)\s*(?:\(Days?\)|Days?)?/i },
  // Delivery Days: "Delivery\nDays\n49Person..." — number on 3rd line, directly before name
  { key: 'deliveryPeriod', label: 'Delivery Days', regex: /Delivery\nDays\n(\d+)/i },
  // Inspection Required: value may be on same line or next
  { key: 'inspectionRequired', label: 'Inspection Required', regex: /Inspection\s*Required[\s\S]{0,120}?\n(Yes|No)\b/i },
  // MSE Exemption: "MSE Exemption for Years Of Experience\nand  Turnover\nYes | Complete"
  { key: 'mseExemption', label: 'MSE Exemption', regex: /(?:MSE\s*(?:Relaxation|Exemption)\s*(?:for\s*Years\s*Of\s*Experience\s*(?:and\s*Turnover)?)?|MSE\s*(?:Relaxation|Exemption)\s*for\s*Years[\s\S]{0,120}?(?:Experience|Turnover))[\s\S]{0,80}?\b(Yes(?:\s*\|[^\n]{0,30})?|No)\b/i },
  // Startup Relaxation: "Startup Exemption for Years Of\nExperience and  Turnover\nYes | Complete"
  { key: 'startupExemption', label: 'Startup Exemption', regex: /(?:Startup\s*(?:Relaxation|Exemption)\s*(?:for\s*Years\s*Of\s*Experience\s*(?:and\s*Turnover)?)?|Startup\s*(?:Relaxation|Exemption)\s*for\s*Years[\s\S]{0,120}?(?:Experience|Turnover))[\s\S]{0,80}?\b(Yes(?:\s*\|[^\n]{0,30})?|No)\b/i },
  // Consignee delivery address — match 6-digit pincode (starting with 49 for CG) and grab address line, or fallback
  { key: 'consigneeAddress', label: 'Consignee / Delivery Address', regex: /(49\d{4}[^\n]{1,150})/i },
  // Payment Terms
  { key: 'paymentTerms', label: 'Payment Terms', regex: /Payment\s*Terms?[^\n]{0,10}?([^\n]{1,100})/i },
  // Experience Criteria - require a colon to match actual description instead of required documents list
  { key: 'experienceCriteria', label: 'Experience Criteria', regex: /Experience\s*Criteria\s*:\s*([^\n]{5,100})/i },
  // Experience Criteria (Years)
  { key: 'experienceYears', label: 'Experience Required (Years)', regex: /(?:Years\s*of\s*Past\s*Experience\s*Required|वष%वष%\/Years\s*of\s*Past\s*Experience\s*Required)[\s\S]{0,100}?\b(\d+)\s*(?:Years?|\(s\)|Year)/i },
  // Bid type: "Type of BidTwo Packet Bid" — directly concatenated
  { key: 'bidType', label: 'Bid Type', regex: /Type\s*of\s*Bid\s*([A-Z][^\n]{1,50})/i },
  // EMD Required flag: "Required\nNo" or "Required\nYes" after EMD Detail section
  { key: 'emdRequired', label: 'EMD Required', regex: /EMD\s*Detail[\s\S]{0,150}?\bRequired\s*(Yes|No)\b/i },
  // Min bids
  { key: 'minBidsRequired', label: 'Min. Bids Required', regex: /Minimum\s*number\s*of\s*bids[^\d\n]{0,30}?(\d+)/i },
];

function parseNumber(str) {
  if (!str) return null;
  const num = Number(str.replace(/,/g, ''));
  return isNaN(num) ? null : num;
}

function firstMatch(text, patterns, isBidValue = false) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const val = parseNumber(m[1]);
      if (isBidValue && val === 10 && (m[0].toLowerCase().includes('crore') || m[0].toLowerCase().includes('rs 10'))) {
        continue;
      }
      return val;
    }
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
    return { bidValue, emdAmount, status: status || 'not_attempted', extractedText, extractedFields, rows: [] };
  }

  if (tender.source === 'CSPGCL') {
    try {
      const result = await extractCspgclPdf(pdfPath);
      return {
        bidValue: result.bidValue ?? bidValue,
        emdAmount: result.emdAmount ?? emdAmount,
        status: (result.bidValue ?? bidValue) != null || (result.emdAmount ?? emdAmount) != null ? 'extracted' : 'not_found',
        extractedText: result.rawText,
        extractedFields: result.extractedFields,
        rows: result.rows,
      };
    } catch (e) {
      console.error('[extract] CSPGCL pdf-parse failed:', e.message);
      return { bidValue, emdAmount, status: 'not_found', extractedText: null, extractedFields: {}, rows: [] };
    }
  }

  try {
    const buf = fs.readFileSync(pdfPath);
    const data = await pdfParse(buf);
    const text = data.text || '';
    extractedText = text.replace(/\s+/g, ' ').trim().slice(0, 4000);

    if (bidValue == null) bidValue = firstMatch(text, VALUE_PATTERNS, true);
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
