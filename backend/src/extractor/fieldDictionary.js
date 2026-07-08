/**
 * extractor/fieldDictionary.js
 *
 * Declarative registry of every extractable field from a GeM NIT PDF.
 *
 * Schema per entry:
 * {
 *   key:      string    — output property name
 *   section:  string    — which section to search in (from sections.js keys)
 *   anchor:   string    — English label to find in the section (case-insensitive)
 *   regex:    RegExp    — run on the window of lines after the anchor
 *   shape:    RegExp    — optional: the CAPTURED GROUP must also match this shape.
 *                         Prevents false captures when multi-line wrapping pushes
 *                         an adjacent field's value into the search window.
 *   type:     string    — 'text' | 'money' | 'number' | 'boolean' | 'date' | 'days' | 'percent'
 *   required: boolean   — used by validators.js
 *   window:   number    — how many lines after anchor to search (default 3)
 * }
 *
 * Why anchor + shape, not "capture between two labels":
 *   GeM PDFs are a two-column template (Hindi | English | value).
 *   A wrapped label can push its value onto a line before the next label.
 *   Shape matching validates the captured text is the expected kind of value,
 *   not a stray phrase from a multi-line label.
 *
 * fieldExtractor.js loops this list automatically.
 * To add a new field: add one entry here. That is it.
 */

export const FIELD_DICTIONARY = [

  // ── Bid Details ──────────────────────────────────────────────────────────────

  {
    key: 'bidNumber',
    section: 'BID_DETAILS',
    anchor: 'Bid Number',
    regex: /Bid\s+Number\s*[:\-]?\s*([A-Z0-9\/\-_]{10,40})/i, // single contiguous token, no spaces
    shape: /^GEM\//i,
    type: 'text',
    required: true,
    window: 3,
  },
  {
    key: 'ministry',
    section: 'BID_DETAILS',
    anchor: 'Ministry',
    regex: /Ministry(?:\/State)?\s+Name\s*[:\-]?\s*(.{3,100})/i, // strip label suffix
    shape: /[A-Za-z]{3}/,
    type: 'text',
    required: false,
    window: 2,
  },
  {
    key: 'department',
    section: 'BID_DETAILS',
    anchor: 'Department',
    regex: /Department\s+Name\s*[:\-]?\s*(.{3,100})/i,
    shape: /[A-Za-z]{3}/,
    type: 'text',
    required: true,
    window: 2,
  },
  {
    key: 'organisation',
    section: 'BID_DETAILS',
    anchor: 'Organisation',
    regex: /Organi[sz]ation\s+Name\s*[:\-]?\s*(.{3,100})/i,
    shape: /[A-Za-z]{3}/,
    type: 'text',
    required: false,
    window: 2,
  },
  {
    key: 'office',
    section: 'BID_DETAILS',
    anchor: 'Office',
    regex: /Office\s+Name\s*[:\-]?\s*(.{3,100})/i,
    shape: /[A-Za-z]{3}/,
    type: 'text',
    required: false,
    window: 2,
  },
  {
    key: 'bidStartDate',
    section: 'PREAMBLE', // Dated: is usually in the PREAMBLE at the top
    anchor: 'Dated',
    regex: /(?:Dated|Start\s+Date)[^:\d\n]*[:\-]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/i,
    shape: /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}$/,
    type: 'date',
    required: false,
    window: 3,
  },
  {
    key: 'bidEndDate',
    section: 'BID_DETAILS',
    anchor: 'Bid End Date',
    regex: /Bid\s+End\s+Date[^:\d\n]*[:\-]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/i,
    shape: /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}$/,
    type: 'date',
    required: false,
    window: 3,
  },
  {
    key: 'bidOpeningDate',
    section: 'BID_DETAILS',
    anchor: 'Bid Opening', // simplify anchor to handle spacing separation
    regex: /Bid\s+Opening[^:\d\n]*[:\-]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/i,
    shape: /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}$/,
    type: 'date',
    required: false,
    window: 3,
  },
  {
    key: 'bidType',
    section: 'BID_DETAILS',
    anchor: 'Bid Type',
    regex: /Bid\s+Type\s*[:\-]?\s*((?:BOQ|Bid|Reverse\s*Auction|Single\s*Packet|Two\s*Packet)[^\n]{0,40})/i,
    shape: /(?:BOQ|Bid|Reverse|Single|Two)/i,
    type: 'text',
    required: false,
    window: 2,
  },
  {
    key: 'bidToRA',
    section: 'BID_DETAILS',
    anchor: 'Bid to RA',
    regex: /Bid\s+to\s+RA\s*(?:enabled)?\s*(Yes|No)/i, // handle "enabledYes"
    shape: /^(?:Yes|No)$/i,
    type: 'boolean',
    required: false,
    window: 2,
  },
  {
    key: 'bidOfferValidityDays',
    // pdftotext layout: "( ) /Bid Offer" [line A] + "80 (Days)" [line B] + "Validity (From End Date)" [line C]
    // The value is on line B, BEFORE the full label on line C.
    // Anchor on "Validity (From End Date)"; lookBehind=2 in anchorSearch brings line B into window.
    section: 'FULL_TEXT',
    anchor: 'Validity (From End Date)',
    regex: /(\d+)\s*\(Days?\)/i,
    shape: /^\d+$/,
    type: 'number',
    required: false,
    window: 1,
  },
  {
    key: 'totalQuantity',
    section: 'BID_DETAILS',
    anchor: 'Total Quantity',
    regex: /Total\s+Quantity[^:\n]*[:\-]?\s*(\d[\d,]*)/i,
    shape: /^[\d,]+$/,
    type: 'number',
    required: false,
    window: 2,
  },
  {
    key: 'emdAmount',
    section: 'BID_DETAILS',
    anchor: 'EMD',
    regex: /(?:EMD|Earnest\s*Money)(?:\s*(?:Amount|Detail))?[\s:\-]{0,5}((?:₹|Rs\.?)?\s*[\d,]+(?:\.\d+)?(?:\s*(?:Lakh|Lac|Cr|Crore|K))?)/i,
    shape: /^(?:₹|Rs\.?)?\s*(?:\d{3,}|[\d.,]+\s*(?:Lakh|Lac|Cr|Crore|K))/i, // at least 3 digits or multiplier
    type: 'money',
    required: false,
    window: 3,
  },
  {
    key: 'bidValue',
    section: 'BID_DETAILS',
    anchor: 'Estimated Value',
    regex: /(?:Estimated\s+)?(?:Estimated|Bid)\s*Value[\s:\-]{0,5}((?:₹|Rs\.?)?\s*[\d,]+(?:\.\d+)?(?:\s*(?:Lakh|Lac|Cr|Crore))?)/i,
    shape: /^(?:₹|Rs\.?)?\s*(?:\d{3,}|[\d.,]+\s*(?:Lakh|Lac|Cr|Crore))/i,
    type: 'money',
    required: false,
    window: 3,
  },

  // ── Item Details ─────────────────────────────────────────────────────────────

  {
    key: 'itemCategory',
    section: 'ITEM_DETAILS',
    anchor: 'Item Category',
    regex: /Item\s+Category\s*[:\-]?\s*(.{3,120})/i,
    shape: /[A-Za-z]{3}/,
    type: 'text',
    required: true,
    window: 2,
  },
  {
    key: 'itemCategory',
    section: 'ITEM_DETAILS',
    anchor: 'Categories selected for notification',
    regex: /(?:Relevant\s+)?Categories\s+selected\s+for\s+notification\s*[:\-]?\s*(.{3,120})/i,
    shape: /[A-Za-z]{3}/,
    type: 'text',
    required: true,
    window: 3,
  },
  {
    key: 'itemCategory',
    section: 'ITEM_DETAILS',
    anchor: 'BOQ Title',
    regex: /BOQ\s+Title\s*[:\-]?\s*(.{3,120})/i,
    shape: /[A-Za-z]{3}/,
    type: 'text',
    required: true,
    window: 3,
  },
  {
    key: 'quantity',
    section: 'ITEM_DETAILS',
    anchor: 'Quantity',
    regex: /Quantity\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/i,
    shape: /^[\d,]+/,
    type: 'number',
    required: false,
    window: 2,
  },
  {
    key: 'deliveryDays',
    section: 'ITEM_DETAILS',
    anchor: 'Delivery Period',
    regex: /Delivery\s+Period\s*[:\-]?\s*([\d]+(?:\.\d+)?)\s*(Days?|Months?|Weeks?|Years?)?/i,
    shape: /^\d+/,
    type: 'days',
    required: false,
    window: 2,
  },
  {
    key: 'primaryProductCategory',
    section: 'ITEM_DETAILS',
    anchor: 'Primary Product Category',
    regex: /Primary\s+Product\s+Category\s*[:\-]?\s*(.{3,120})/i,
    shape: /[A-Za-z]{3}/,
    type: 'text',
    required: false,
    window: 2,
  },

  // ── Eligibility ───────────────────────────────────────────────────────────────

  {
    key: 'minAnnualTurnover',
    // Appears in first-page summary table — section varies (ITEM_DETAILS / BID_DETAILS)
    // Actual PDF text: "1 Lakh (s)" — single digit + Lakh + optional (s)
    section: 'FULL_TEXT',
    anchor: 'Minimum Average Annual Turnover',
    regex: /(?:Minimum|Min\.?)\s+(?:Average\s+)?Annual\s+Turnover[^\n]{0,30}?([\d,]+(?:\.\d+)?\s*(?:Lakh|Lac|Cr|Crore|K)?)/i,
    shape: /^[\d,]+(?:\.\d+)?(?:\s*(?:Lakh|Lac|Cr|Crore|K))?/i,
    type: 'money',
    required: false,
    window: 3,
  },
  {
    key: 'oemAverageTurnover',
    section: 'ELIGIBILITY_CRITERIA',
    anchor: 'OEM Average Turnover',
    regex: /OEM\s+Average\s+Turnover[\s:\-]{0,5}((?:₹|Rs\.?)?\s*[\d,]+(?:\.\d+)?(?:\s*(?:Lakh|Lac|Cr|Crore))?)/i,
    shape: /^(?:₹|Rs\.?)?\s*(?:\d{3,}|[\d.,]+\s*(?:Lakh|Lac|Cr|Crore))/i,
    type: 'money',
    required: false,
    window: 3,
  },
  {
    key: 'yearsOfExperience',
    // Appears in first-page summary table — section varies (ITEM_DETAILS / BID_DETAILS)
    section: 'FULL_TEXT',
    anchor: 'Years of Past Experience Required',
    regex: /Years\s+of\s+Past\s+Experience\s+Required[^\n]{0,40}(\d+(?:\.\d+)?)\s*[Yy]ear/i,
    shape: /^\d+/,
    type: 'number',
    required: false,
    window: 3,
  },
  {
    // Fallback: shorter anchor form used in older PDFs
    key: 'yearsOfExperience',
    section: 'FULL_TEXT',
    anchor: 'Experience',
    regex: /(?:Years?\s+of\s+)?Experience\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*[Yy]ears?/i,
    shape: /^\d+/,
    type: 'number',
    required: false,
    window: 3,
  },
  {
    key: 'mseExemption',
    // pdftotext -layout places this in first-page summary table (ITEM_DETAILS/BID_DETAILS).
    // Use FULL_TEXT so it is found regardless of which section the table rows fall into.
    // Actual normalized line: "MSE Relaxation for Years Of Experience Yes | Complete"
    section: 'FULL_TEXT',
    anchor: 'MSE Relaxation for Years Of Experience',
    regex: /MSE\s+Relaxation\s+for\s+Years\s+Of\s+Experience(?:[^\n]*)\b(Yes|No)\b/i,
    shape: /^(?:Yes|No)$/i,
    type: 'boolean',
    required: false,
    window: 2,
  },
  {
    // Fallback: older GeM PDF format that uses "MSE Exemption"
    key: 'mseExemption',
    section: 'ELIGIBILITY_CRITERIA',
    anchor: 'MSE Exemption',
    regex: /MSE\s+Exemption\s*[:\-]?\s*(Yes|No|Applicable|Not\s+Applicable|Exempted)/i,
    shape: /^(?:Yes|No|Applicable|Not|Exempted)/i,
    type: 'boolean',
    required: false,
    window: 2,
  },
  {
    key: 'startupExemption',
    // pdftotext -layout places this in first-page summary table (ITEM_DETAILS/BID_DETAILS).
    // Actual normalized line: "Startup Relaxation for Years Of Yes | Complete"
    // (label wraps: "Experience and Turnover" is on the next line)
    section: 'FULL_TEXT',
    anchor: 'Startup Relaxation for Years Of',
    regex: /Startup\s+Relaxation\s+for\s+Years\s+Of(?:[^\n]*)\b(Yes|No)\b/i,
    shape: /^(?:Yes|No)$/i,
    type: 'boolean',
    required: false,
    window: 2,
  },
  {
    // Fallback: older GeM PDF format that uses "Startup Exemption"
    key: 'startupExemption',
    section: 'ELIGIBILITY_CRITERIA',
    anchor: 'Startup Exemption',
    regex: /Startup\s+Exemption\s*[:\-]?\s*(Yes|No|Applicable|Not\s+Applicable|Exempted)/i,
    shape: /^(?:Yes|No|Applicable|Not|Exempted)/i,
    type: 'boolean',
    required: false,
    window: 2,
  },
  {
    key: 'msePurchasePreference',
    section: 'ELIGIBILITY_CRITERIA',
    anchor: 'MSE Purchase Preference',
    regex: /MSE\s+Purchase\s+Preference\s*[:\-]?\s*(Yes|No|Applicable|Not\s+Applicable)/i,
    shape: /^(?:Yes|No|Applicable|Not)/i,
    type: 'boolean',
    required: false,
    window: 2,
  },
  {
    key: 'technicalClarificationDays',
    // pdftotext layout: "  Time allowed for Technical 2 Days" (label truncated mid-wrap)
    // then "Clarifications during technical evaluation" on next line.
    // Value "2 Days" is inline on the anchor line. Use short anchor to match the first line.
    section: 'FULL_TEXT',
    anchor: 'Time allowed for Technical',
    regex: /Time\s+allowed\s+for\s+Technical[^\n]*\b(\d+)\s*Days?/i,
    shape: /^\d+$/,
    type: 'number',
    required: false,
    window: 2,
  },
  {
    // Fallback: older PDF forms
    key: 'technicalClarificationDays',
    section: 'FULL_TEXT',
    anchor: 'Technical Clarification',
    regex: /Technical\s+Clarification[^\n]{0,60}\b(\d+)\s*Days?/i,
    shape: /^\d+$/,
    type: 'number',
    required: false,
    window: 2,
  },
  {
    key: 'typeOfBid',
    // PDF: "Type of Bid Two Packet Bid" in second Bid Details page
    section: 'FULL_TEXT',
    anchor: 'Type of Bid',
    regex: /Type\s+of\s+Bid\s*[:\-]?\s*((?:Single|Two)\s+Packet[^\n]{0,20})/i,
    shape: /(?:Single|Two)/i,
    type: 'text',
    required: false,
    window: 2,
  },
  {
    key: 'inspectionRequired',
    // pdftotext layout:
    //   Line A: "    )/Inspection Required (By"
    //   Line B: "                                       No"
    //   Line C: "Empanelled Inspection Authority / Agencies"
    // Value is on line B (next line after anchor). Use [\s\S] to cross newline.
    section: 'FULL_TEXT',
    anchor: 'Inspection Required',
    regex: /Inspection\s+Required[\s\S]{0,100}?\b(Yes|No)\b/i,
    shape: /^(?:Yes|No)$/i,
    type: 'boolean',
    required: false,
    window: 3,
  },
  {
    key: 'pastPerformancePct',
    // pdftotext layout line: "       Past Performance 20 %"
    // First hit of "Past Performance" anchor is the CSV "Experience Criteria,Past Performance,..."
    // which has no %. The direct regex on FULL_TEXT correctly finds the standalone line.
    // Using section-level direct regex (not anchorSearch) via the tryExtract on sectionText path.
    section: 'FULL_TEXT',
    anchor: 'Past Performance',
    // This regex is run on the FULL section text directly (not just anchorSearch window),
    // so it finds the standalone "Past Performance 20 %" line regardless of match order.
    regex: /^\s*Past\s+Performance\s+([\d.]+)\s*%/im,
    shape: /^[\d.]+$/,
    type: 'percent',
    required: false,
    window: 2,
  },
  {
    key: 'evaluationMethod',
    // PDF normalized line: "   Evaluation Method Total value wise evaluation"
    // normalize.js collapses runs of spaces to 1 space, so \s{2,} won't match.
    section: 'FULL_TEXT',
    anchor: 'Evaluation Method',
    regex: /\bEvaluation\s+Method\b\s+(.{3,80})/i,
    shape: /[A-Za-z]{3}/,
    type: 'text',
    required: false,
    window: 2,
  },
  {
    key: 'arbitrationClause',
    section: 'FULL_TEXT',
    anchor: 'Arbitration Clause',
    regex: /Arbitration\s+Clause[^\n]{0,30}\b(Yes|No)\b/i,
    shape: /^(?:Yes|No)$/i,
    type: 'boolean',
    required: false,
    window: 2,
  },
  {
    key: 'mediationClause',
    section: 'FULL_TEXT',
    anchor: 'Mediation Clause',
    regex: /Mediation\s+Clause[^\n]{0,30}\b(Yes|No)\b/i,
    shape: /^(?:Yes|No)$/i,
    type: 'boolean',
    required: false,
    window: 2,
  },
  {
    key: 'epbgRequired',
    // PDF layout: "ePBG Detail" on one line, then blank, then "Required No" 3 lines later.
    // lookBehind in anchorSearch covers the "Required No" line which is after the anchor.
    // window:4 ensures we reach it.
    section: 'FULL_TEXT',
    anchor: 'ePBG',
    regex: /ePBG[^\n]*(?:\n[^\n]*){0,4}\bRequired\s+(Yes|No)\b/i,
    shape: /^(?:Yes|No)$/i,
    type: 'boolean',
    required: false,
    window: 4,
  },
  {
    key: 'miiPurchasePreference',
    // PDF: "MII Purchase Preference No" in its own section
    section: 'FULL_TEXT',
    anchor: 'MII Purchase Preference',
    regex: /MII\s+Purchase\s+Preference[^\n]{0,30}\b(Yes|No|Applicable|Not\s+Applicable)\b/i,
    shape: /^(?:Yes|No|Applicable|Not)/i,
    type: 'boolean',
    required: false,
    window: 2,
  },
];

/** Lookup a field definition by key */
export function getFieldDef(key) {
  return FIELD_DICTIONARY.find((f) => f.key === key) || null;
}

/** Get all required field keys */
export function getRequiredKeys() {
  return FIELD_DICTIONARY.filter((f) => f.required).map((f) => f.key);
}
