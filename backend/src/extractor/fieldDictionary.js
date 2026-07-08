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
    section: 'BID_DETAILS',
    anchor: 'Bid Offer Validity',
    regex: /Bid\s+Offer\s+Validity[^\n]{0,30}[:\-]?\s*(\d+)/i,
    shape: /^\d+$/,
    type: 'number',
    required: false,
    window: 4,
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
    section: 'ELIGIBILITY_CRITERIA',
    anchor: 'Minimum Average Annual Turnover',
    regex: /(?:Minimum|Min\.?)\s+(?:Average\s+)?Annual\s+Turnover[\s:\-]{0,5}((?:₹|Rs\.?)?\s*[\d,]+(?:\.\d+)?(?:\s*(?:Lakh|Lac|Cr|Crore))?)/i,
    shape: /^(?:₹|Rs\.?)?\s*(?:\d{3,}|[\d.,]+\s*(?:Lakh|Lac|Cr|Crore))/i,
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
    section: 'ELIGIBILITY_CRITERIA',
    anchor: 'Experience',
    regex: /(?:Years?\s+of\s+)?Experience\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*[Yy]ears?/i,
    shape: /^\d+/,
    type: 'number',
    required: false,
    window: 3,
  },
  {
    key: 'mseExemption',
    section: 'ELIGIBILITY_CRITERIA',
    // Actual GeM PDF label: "MSE Relaxation for Years of Experience and Turnover"
    // The value (Yes/No) is on the SAME line, right after "Turnover".
    // Also handles older label variant "MSE Exemption" for backward compatibility.
    anchor: 'MSE Relaxation for Years of Experience',
    regex: /MSE\s+Relaxation\s+for\s+Years\s+of\s+Experience\s+and\s+Turnover[\s\S]{0,30}?\b(Yes|No)\b/i,
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
    section: 'ELIGIBILITY_CRITERIA',
    // Actual GeM PDF label: "Startup Relaxation for Years of Experience and Turnover"
    // The value (Yes/No) is on the SAME line, right after "Turnover".
    anchor: 'Startup Relaxation for Years of Experience',
    regex: /Startup\s+Relaxation\s+for\s+Years\s+of\s+Experience\s+and\s+Turnover[\s\S]{0,30}?\b(Yes|No)\b/i,
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
    section: 'ELIGIBILITY_CRITERIA',
    anchor: 'Time for Technical Clarification',
    regex: /(?:Time\s+for\s+)?Technical\s+Clarification[^\n]{0,30}[:\-]?\s*(\d+)\s*(?:Days?)?/i,
    shape: /^\d+$/,
    type: 'number',
    required: false,
    window: 2,
  },
  {
    key: 'typeOfBid',
    section: 'ELIGIBILITY_CRITERIA',
    anchor: 'Type of Bid',
    regex: /Type\s+of\s+Bid\s*[:\-]?\s*(Single\s+Packet|Two\s+Packet[^\n]{0,20})/i,
    shape: /(?:Single|Two)/i,
    type: 'text',
    required: false,
    window: 2,
  },
  {
    key: 'inspectionRequired',
    section: 'ELIGIBILITY_CRITERIA',
    anchor: 'Inspection Required',
    regex: /Inspection\s+Required[^:\n]{0,20}[:\-]?\s*(Yes|No)/i,
    shape: /^(?:Yes|No)$/i,
    type: 'boolean',
    required: false,
    window: 3,
  },
  {
    key: 'pastPerformancePct',
    section: 'ELIGIBILITY_CRITERIA',
    anchor: 'Past Performance',
    regex: /Past\s+Performance[^:\n]{0,30}[:\-]?\s*([\d.]+)\s*%/i,
    shape: /^[\d.]+$/,
    type: 'percent',
    required: false,
    window: 3,
  },
  {
    key: 'evaluationMethod',
    section: 'ELIGIBILITY_CRITERIA',
    anchor: 'Evaluation Method',
    regex: /Evaluation\s+Method[^:\n]{0,20}[:\-]?\s*(.{3,80})/i,
    shape: /[A-Za-z]{2}/,
    type: 'text',
    required: false,
    window: 2,
  },
  {
    key: 'arbitrationClause',
    section: 'ELIGIBILITY_CRITERIA',
    anchor: 'Arbitration Clause',
    regex: /Arbitration\s+Clause[^:\n]{0,20}[:\-]?\s*(Yes|No)/i,
    shape: /^(?:Yes|No)$/i,
    type: 'boolean',
    required: false,
    window: 2,
  },
  {
    key: 'mediationClause',
    section: 'ELIGIBILITY_CRITERIA',
    anchor: 'Mediation Clause',
    regex: /Mediation\s+Clause[^:\n]{0,20}[:\-]?\s*(Yes|No)/i,
    shape: /^(?:Yes|No)$/i,
    type: 'boolean',
    required: false,
    window: 2,
  },
  {
    key: 'epbgRequired',
    section: 'BID_DETAILS',
    anchor: 'ePBG Detail',
    regex: /ePBG[^:\n]{0,30}[:\-]?\s*(Yes|No)/i,
    shape: /^(?:Yes|No)$/i,
    type: 'boolean',
    required: false,
    window: 4,
  },
  {
    key: 'miiPurchasePreference',
    section: 'ELIGIBILITY_CRITERIA',
    anchor: 'MII Purchase Preference',
    regex: /MII\s+Purchase\s+Preference[^:\n]{0,20}[:\-]?\s*(Yes|No|Applicable|Not\s+Applicable)/i,
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
