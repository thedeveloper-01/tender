/**
 * cspgcl_extract.js
 *
 * Dedicated PDF extractor for CSPGCL NIT (Notice Inviting Tender) documents.
 * CSPGCL PDFs use a specific table format with columns:
 *   S.N | Tender Spec No | Name of Work | NIT Value (w/o GST) | EMD (Rs.) |
 *   Tender Period | Completion Period | RFx No. | Last date/time | Bid Opening date
 *
 * This extractor is designed to work purely on the backend server side —
 * no local files needed; it downloads the PDF in-memory and extracts all fields.
 */

import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function parseAmount(str) {
  if (!str) return null;
  // Remove currency symbols, commas, "Lacs", "Lakhs" etc.
  const clean = str.replace(/[₹Rs.,]/g, '').replace(/lacs?|lakhs?/i, '').trim();
  const n = parseFloat(clean.replace(/,/g, ''));
  if (isNaN(n)) return null;
  // If the original had "Lacs" or "Lakhs", multiply by 100000
  if (/lacs?|lakhs?/i.test(str)) return n * 100000;
  return n;
}

function parseCspgclDate(str) {
  if (!str) return null;
  // "08.06.2026" or "08/06/2026" or "08-06-2026"
  const m = str.trim().match(/(\d{2})[.\/-](\d{2})[.\/-](\d{4})/);
  if (m) {
    const d = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00+05:30`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// ── patterns for the NIT table rows ──────────────────────────────────────────

// Matches lines like "CEC/HTPS/ KW/W/ 2026/20" (Tender Spec No.)
const SPEC_NO_RE = /(?:CEC|CEC\/|No\.\s*)[\w\/.\-\s]{3,40}/i;

// Matches lines like "81000 51455" (RFx No. pair)
const RFX_NO_RE = /\b(\d{5,6})\s+(\d{5,6})\b/;

// NIT value — rows often have "4.45" or "3.67" (in Lacs)
const NIT_VALUE_RE = /(\d+(?:\.\d+)?)\s*Lacs?\s*(?:\(without\s*GST\))?/i;

// EMD amount
const EMD_RE = /(?:EMD|Earnest\s*Money)[^₹\d\n]*(?:₹|Rs\.?)?\s*([\d,]+(?:\.\d+)?)/i;

// Completion period
const COMPLETION_RE = /(\d+\+?\d*)\s*(?:Months?|Years?|Days?)/i;

// Last date for submission
const LAST_DATE_RE = /Last\s*date[^:]*?:\s*([^\n]+)/i;

// Bid opening date
const OPEN_DATE_RE = /Bid\s*[Oo]pening[^:]*?:\s*([^\n]+)/i;

// Office / issuing authority
const OFFICE_RE = /OFFICE\s+OF\s+THE\s+([^\n]{10,100})/i;

// Portal e-bidding link
const PORTAL_RE = /https?:\/\/ebidding\.cspel\.co\.in[^\s]*/i;

// ── main extractor ────────────────────────────────────────────────────────────

/**
 * extractCspgclPdf(pdfPathOrBuffer)
 *
 * Accepts either a file path string or a Buffer.
 * Returns an object with all extracted fields.
 */
export async function extractCspgclPdf(pdfPathOrBuffer) {
  let buf;
  if (typeof pdfPathOrBuffer === 'string') {
    if (!fs.existsSync(pdfPathOrBuffer)) {
      return { status: 'not_found', rows: [], rawText: null };
    }
    buf = fs.readFileSync(pdfPathOrBuffer);
  } else {
    buf = pdfPathOrBuffer;
  }

  let text;
  try {
    const data = await pdfParse(buf);
    text = data.text || '';
  } catch (e) {
    console.error('[cspgcl_extract] pdf-parse failed:', e.message);
    return { status: 'parse_error', rows: [], rawText: null };
  }

  // Normalise whitespace but keep newlines for pattern matching
  const cleanText = text.replace(/[ \t]+/g, ' ').replace(/\r\n/g, '\n');
  const rawText = cleanText.slice(0, 6000); // excerpt for frontend display

  // ── Extract top-level document fields ──────────────────────────────────────

  const officeMatch = cleanText.match(OFFICE_RE);
  const issuingOffice = officeMatch ? officeMatch[1].trim() : null;

  const portalLink = (cleanText.match(PORTAL_RE) || [])[0] || null;

  // ── Parse each table row ───────────────────────────────────────────────────
  // Strategy: split by S.N markers (1, 2, 3 ...) to isolate individual rows,
  // then extract fields from each segment.

  const rows = [];

  // Find all row blocks — rows start with a line like "1 CEC/..." or just "1\n"
  // We split the text on lines that start with a digit followed by whitespace / newline
  const rowBlocks = cleanText
    .split(/\n(?=\s*\d+\s+(?:CEC|KW|CEC\/|[\w.\/]{3,}|\n))/)
    .filter((block) => /^\s*\d+\s/.test(block));

  for (const block of rowBlocks) {
    // Skip if block is too short to be a real row
    if (block.length < 30) continue;

    // Tender spec no
    const specMatch = block.match(SPEC_NO_RE);
    const tenderSpecNo = specMatch ? specMatch[0].trim().replace(/\s+/g, ' ') : null;

    // NIT value (Lacs)
    const nitMatch = block.match(NIT_VALUE_RE);
    const nitValueLacs = nitMatch ? parseFloat(nitMatch[1]) : null;
    const nitValueRs = nitValueLacs != null ? nitValueLacs * 100000 : null;

    // EMD
    const emdMatch = block.match(EMD_RE);
    const emdAmount = emdMatch ? parseAmount(emdMatch[1]) : null;

    // RFx No
    const rfxMatch = block.match(RFX_NO_RE);
    const rfxNos = rfxMatch ? [rfxMatch[1], rfxMatch[2]] : [];

    // Completion period
    const compMatch = block.match(COMPLETION_RE);
    const completionPeriod = compMatch ? compMatch[0].trim() : null;

    // Name of work — the large descriptive text block
    // Everything between the spec no and the numbers is likely the scope
    const scopeCandidate = block
      .replace(/^\s*\d+\s*/, '') // remove leading S.N
      .split('\n')
      .filter((l) => !/^\s*[\d.]+\s*$/.test(l)) // remove pure-number lines
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);

    if (!nitValueLacs && !emdAmount && !tenderSpecNo) continue; // skip junk blocks

    rows.push({
      tenderSpecNo,
      scope: scopeCandidate,
      nitValueLacs,
      nitValueRs,
      emdAmount,
      rfxNos,
      completionPeriod,
    });
  }

  // ── Fallback: top-level amount extraction if table parsing yielded nothing ─

  let bidValue = null;
  let emdAmountTop = null;

  if (rows.length > 0) {
    // Use first row's values as the primary bid value / EMD
    bidValue = rows[0].nitValueRs;
    emdAmountTop = rows[0].emdAmount;
  } else {
    // Fallback regex extraction from raw text
    const nitFb = cleanText.match(NIT_VALUE_RE);
    if (nitFb) bidValue = parseFloat(nitFb[1]) * 100000;
    const emdFb = cleanText.match(EMD_RE);
    if (emdFb) emdAmountTop = parseAmount(emdFb[1]);
  }

  // ── Last date & Bid opening date ───────────────────────────────────────────

  const lastDateMatch = cleanText.match(LAST_DATE_RE);
  const lastDateStr = lastDateMatch ? lastDateMatch[1].trim().slice(0, 40) : null;
  const lastDate = parseCspgclDate(lastDateStr);

  const openDateMatch = cleanText.match(OPEN_DATE_RE);
  const openDateStr = openDateMatch ? openDateMatch[1].trim().slice(0, 40) : null;
  const openDate = parseCspgclDate(openDateStr);

  const status = (bidValue != null || emdAmountTop != null) ? 'extracted' : 'not_found';

  return {
    status,
    bidValue,
    emdAmount: emdAmountTop,
    issuingOffice,
    portalLink,
    lastDate,
    openDate,
    rows,          // all individual tenders from the NIT table
    rawText,       // first 6000 chars of extracted text for frontend
    extractedFields: {
      issuingOffice:    issuingOffice ? { label: 'Issuing Office', value: issuingOffice } : undefined,
      portalLink:       portalLink    ? { label: 'e-Bidding Portal', value: portalLink } : undefined,
      lastSubmission:   lastDateStr   ? { label: 'Last Date for Submission', value: lastDateStr } : undefined,
      bidOpeningDate:   openDateStr   ? { label: 'Bid Opening Date', value: openDateStr } : undefined,
      totalRowsInNIT:   rows.length   ? { label: 'Total Items in NIT', value: String(rows.length) } : undefined,
    },
  };
}
