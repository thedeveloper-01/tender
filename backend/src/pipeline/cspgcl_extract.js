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
  const clean = str.replace(/[₹Rs,]/g, '').replace(/lacs?|lakhs?/i, '').trim();
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

function parseHindiLetter(cleanText) {
  const blocks = cleanText
    .split(/\n(?=\s*\(?\d+\)?\s*(?:िनिवदा|काय\*|काय|spec|No|CEC|CEC\/))/i)
    .filter((block) => /^\s*\(?\d+\)?\s+/.test(block));

  const rows = [];
  for (const block of blocks) {
    if (block.length < 30) continue;

    // Spec Number
    const specMatch = block.match(/(?:िनिवदा\s*िवश[ेै]ष[ीि]करण\s*मांक|िवश[ेै]ष[ीि]करण\s*मांक|spec\s*(?:no)?\.?)\s*(?::-|:)\s*([^\n]+)/i);
    const tenderSpecNo = specMatch ? specMatch[1].trim().replace(/\s+/g, ' ') : null;

    // Scope (Name of work)
    const scopeMatch = block.match(/(?:काय\*?\s*का\s*नाम|name\s*of\s*work)\s*(?::-|:)\s*([\s\S]+?)(?=(?:अनुमािनत\s*लागत|estimated|value|$))/i);
    const scope = scopeMatch ? scopeMatch[1].trim().replace(/\s+/g, ' ').slice(0, 300) : null;

    // Estimated Value
    const valueMatch = block.match(/(?:अनुमािनत\s*लागत|estimated\s*cost)\s*:\s*(?:5पये|रुपये|Rs\.?|₹)?\s*([\d,.]+)/i);
    let nitValueRs = null;
    let nitValueLacs = null;
    if (valueMatch) {
      const cleanedNumStr = valueMatch[1].replace(/,/g, '');
      nitValueRs = parseFloat(cleanedNumStr);
      if (isNaN(nitValueRs)) {
        nitValueRs = null;
      } else {
        nitValueLacs = nitValueRs / 100000;
      }
    }

    // EMD
    const emdMatch = block.match(/(?:बयाने?\s*क[0ी]\s*रािश|धरोहर\s*रािश|धरोहर\s*राशि|emd|earnest\s*money)\s*:\s*(?:5पये|रुपये|Rs\.?|₹)?\s*([\d,.]+)/i);
    let emdAmount = null;
    if (emdMatch) {
      const cleanedNumStr = emdMatch[1].replace(/,/g, '');
      emdAmount = parseFloat(cleanedNumStr);
      if (isNaN(emdAmount)) emdAmount = null;
    }

    // Completion Period
    const completionMatch = block.match(/(?:काय\*?\s*पूण\*?\s*करने\s*क[0ी]\s*अव\s*ध|completion\s*period)\s*:\s*([^\n।]+)/i);
    const completionPeriod = completionMatch ? completionMatch[1].trim() : null;

    if (tenderSpecNo || scope || nitValueRs || emdAmount) {
      rows.push({
        tenderSpecNo,
        scope: scope || 'CSPGCL Tender',
        nitValueLacs,
        nitValueRs,
        emdAmount,
        rfxNos: [],
        completionPeriod,
      });
    }
  }
  return rows;
}

function parseEnglishNumberedList(cleanText) {
  const rfxMatch = cleanText.match(/RFx\s*No[^\d\n]*?(\d+)/i);
  const rfxNos = rfxMatch ? [rfxMatch[1]] : [];

  const specMatch = cleanText.match(/(?:Tender\s+)?Specification\s+No[^\n]*\n([^\n]+)/i);
  const tenderSpecNo = specMatch ? specMatch[1].trim().replace(/^:\s*/, '').trim() : null;

  const scopeMatch = cleanText.match(/Particulars[^\n]*\n([\s\S]+?)(?=\n\s*\d+\.|$)/i);
  const scope = scopeMatch ? scopeMatch[1].trim().replace(/\s+/g, ' ').replace(/^:\s*/, '').trim().slice(0, 300) : null;

  const costMatch = cleanText.match(/(?:Estimated\s+)?Cost[^\n]*\n([\s\S]+?)(?=\n\s*\d+\.|$)/i);
  let nitValueRs = null;
  if (costMatch) {
    const costText = costMatch[1];
    const numMatch = costText.match(/(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i);
    if (numMatch) nitValueRs = parseFloat(numMatch[1].replace(/,/g, ''));
  }

  // Use [^\n]*? to prevent overshooting into other lines (e.g. Bank Account details)
  const emdMatch = cleanText.match(/Earnest\s+Money\s+Deposit[^\n]*?(?::|Rs\.?|₹)?\s*([\d,]+)/i);
  const emdAmount = emdMatch ? parseFloat(emdMatch[1].replace(/,/g, '')) : null;

  if (tenderSpecNo || scope || emdAmount) {
    return [{
      tenderSpecNo,
      scope: scope || 'CSPGCL Tender',
      nitValueLacs: nitValueRs ? nitValueRs / 100000 : null,
      nitValueRs,
      emdAmount,
      rfxNos,
      completionPeriod: null
    }];
  }
  return [];
}

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

  // Normalise Devnagari word layout and whitespace
  const cleanText = text
    .replace(/([\u0900-\u097F\*])\s*\n\s*([\u0900-\u097F\*])/g, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r\n/g, '\n');
  const rawText = cleanText.slice(0, 6000); // excerpt for frontend display

  // ── Extract top-level document fields ──────────────────────────────────────

  const officeMatch = cleanText.match(OFFICE_RE);
  const issuingOffice = officeMatch ? officeMatch[1].trim() : null;

  const portalLink = (cleanText.match(PORTAL_RE) || [])[0] || null;

  // ── Parse each table row ───────────────────────────────────────────────────
  let rows = [];

  // Try paragraph style (Hindi letter) first
  rows = parseHindiLetter(cleanText);

  // Try tabular style next
  if (rows.length === 0) {
    const rowBlocks = cleanText
      .split(/\n(?=\s*\d+\s+(?:CEC|KW|CEC\/|[\w.\/]{3,}|\n))/)
      .filter((block) => /^\s*\d+\s/.test(block));

    for (const block of rowBlocks) {
      if (block.length < 30) continue;

      const specMatch = block.match(SPEC_NO_RE);
      const tenderSpecNo = specMatch ? specMatch[0].trim().replace(/\s+/g, ' ') : null;

      const nitMatch = block.match(NIT_VALUE_RE);
      const nitValueLacs = nitMatch ? parseFloat(nitMatch[1]) : null;
      const nitValueRs = nitValueLacs != null ? nitValueLacs * 100000 : null;

      const emdMatch = block.match(EMD_RE);
      const emdAmount = emdMatch ? parseAmount(emdMatch[1]) : null;

      const rfxMatch = block.match(RFX_NO_RE);
      const rfxNos = rfxMatch ? [rfxMatch[1], rfxMatch[2]] : [];

      const compMatch = block.match(COMPLETION_RE);
      const completionPeriod = compMatch ? compMatch[0].trim() : null;

      const scopeCandidate = block
        .replace(/^\s*\d+\s*/, '')
        .split('\n')
        .filter((l) => !/^\s*[\d.]+\s*$/.test(l))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);

      if (!nitValueLacs && !emdAmount && !tenderSpecNo) continue;

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
  }

  // Fallback to English numbered list if still no rows
  if (rows.length === 0) {
    rows = parseEnglishNumberedList(cleanText);
  }

  // ── Fallback: top-level amount extraction if table parsing yielded nothing ─

  let bidValue = null;
  let emdAmountTop = null;

  if (rows.length > 0) {
    bidValue = rows[0].nitValueRs;
    emdAmountTop = rows[0].emdAmount;
  } else {
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
    rows,
    rawText,
    extractedFields: {
      issuingOffice:    issuingOffice ? { label: 'Issuing Office', value: issuingOffice } : undefined,
      portalLink:       portalLink    ? { label: 'e-Bidding Portal', value: portalLink } : undefined,
      lastSubmission:   lastDateStr   ? { label: 'Last Date for Submission', value: lastDateStr } : undefined,
      bidOpeningDate:   openDateStr   ? { label: 'Bid Opening Date', value: openDateStr } : undefined,
      totalRowsInNIT:   rows.length   ? { label: 'Total Items in NIT', value: String(rows.length) } : undefined,
    },
  };
}
