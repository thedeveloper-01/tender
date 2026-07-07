/**
 * extractor/consigneeParser.js
 *
 * Parses the CONSIGNEE_DETAILS section of a GeM NIT PDF.
 */

import { cleanText, parseNumber, parseDays } from './utils.js';

const HEADER_PATTERNS = [
  /s\.?\s*no/i,
  /serial/i,
  /consignee/i,
  /officer/i,
  /address/i,
  /delivery/i,
  /s\.?n\b/i,
  /reporting/i,
  /quantity/i,
  /officer/i,
];

// S.No pattern: a number at start, optionally followed by dot/paren/spaces
const SNO_PATTERN = /^\s*[^\w]*(\d{1,3})(?:[.)]|\s+[A-Z][a-z]+)/;

// Matches exactly 2 capitalized name words (Firstname Lastname)
const OFFICER_NAME_PATTERN = /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/;

/**
 * parseConsignees(sections) → consignee[]
 */
export function parseConsignees(sections) {
  const text = sections['CONSIGNEE_DETAILS'] || '';
  if (!text) return [];

  const lines = text.split('\n').filter((l) => l.trim().length > 0);

  // Detect all S.No lines
  const snoMatches = lines.map((l) => l.match(SNO_PATTERN)).filter(Boolean);

  // If there is only 1 S.No match, group ALL lines together as a single row.
  // This prevents losing address lines that pdftotext renders before the S.No line.
  if (snoMatches.length <= 1) {
    const single = parseConsigneeRow(lines, 1);
    return single ? [single] : [];
  }

  // Multi-consignee: split by S.No boundaries
  const rows = splitIntoConsigneeRows(lines);
  return rows.map((rowLines, idx) => parseConsigneeRow(rowLines, idx + 1)).filter(Boolean);
}

/**
 * splitIntoConsigneeRows(lines) → string[][]
 */
function splitIntoConsigneeRows(lines) {
  const rows = [];
  let currentRow = null;

  for (const line of lines) {
    const snoMatch = line.match(SNO_PATTERN);
    if (snoMatch) {
      if (currentRow) rows.push(currentRow);
      currentRow = [line];
    } else if (currentRow) {
      currentRow.push(line);
    }
  }

  if (currentRow && currentRow.length > 0) rows.push(currentRow);
  return rows;
}

/**
 * parseConsigneeRow(rowLines, fallbackSno) → consignee | null
 */
function parseConsigneeRow(rowLines, fallbackSno) {
  if (!rowLines || rowLines.length === 0) return null;

  // 1. Find the line containing the S.No / Officer name
  let firstLineIdx = 0;
  let sNo = fallbackSno;

  for (let i = 0; i < rowLines.length; i++) {
    const match = rowLines[i].match(SNO_PATTERN);
    if (match) {
      sNo = parseInt(match[1], 10);
      firstLineIdx = i;
      break;
    }
  }

  const firstLine = rowLines[firstLineIdx];

  // 2. Extract Quantity and Delivery Days from the end of the first line.
  // In GeM PDFs, the first row line ends with "... Quantity DeliveryDays"
  // e.g. " 1 Ravi Kumar Floor, Ispat Bhavan Bhilai Steel 4 150"
  let quantity = null;
  let deliveryDays = null;
  let remainingFirstLine = firstLine;

  const trailingMatch = firstLine.match(/\s+(\d+)\s+(\d+)\s*$/);
  if (trailingMatch) {
    quantity = parseNumber(trailingMatch[1]);
    deliveryDays = parseDays(trailingMatch[2]);
    // Strip trailing numbers from the line
    remainingFirstLine = firstLine.substring(0, trailingMatch.index).trim();
  } else {
    // Fallback: search for any trailing single number (Quantity only)
    const singleTrailingMatch = firstLine.match(/\s+(\d+)\s*$/);
    if (singleTrailingMatch) {
      quantity = parseNumber(singleTrailingMatch[1]);
      remainingFirstLine = firstLine.substring(0, singleTrailingMatch.index).trim();
    }
  }

  // 3. Strip S.No prefix from remainingFirstLine
  const snoMatch = remainingFirstLine.match(SNO_PATTERN);
  if (snoMatch) {
    const snoEndIdx = remainingFirstLine.indexOf(snoMatch[1]) + snoMatch[1].length;
    remainingFirstLine = remainingFirstLine.substring(snoEndIdx).trim();
  }

  // 4. Extract Officer Name (exactly 2 capitalized words at start)
  const nameMatch = remainingFirstLine.match(OFFICER_NAME_PATTERN);
  let reportingOfficer = null;
  let addressFirstLine = remainingFirstLine;

  if (nameMatch) {
    reportingOfficer = nameMatch[1];
    const nameEndIdx = remainingFirstLine.indexOf(reportingOfficer) + reportingOfficer.length;
    addressFirstLine = remainingFirstLine.substring(nameEndIdx).trim();
  }

  // 5. Build full address: prepend any lines before firstLine, and append any lines after
  const prependedLines = rowLines.slice(0, firstLineIdx).map((l) => l.trim());
  const appendedLines = rowLines.slice(firstLineIdx + 1).map((l) => l.trim());

  const fullAddressParts = [
    ...prependedLines,
    addressFirstLine,
    ...appendedLines
  ].map((p) => p.trim()).filter((p) => p.length > 0 && !HEADER_PATTERNS.some((hp) => hp.test(p)));

  let address = fullAddressParts.join(', ').trim();
  // Strip duplicate/leading commas
  address = address.replace(/^[,/\s\-#]+|[,/\s\-#]+$/g, '').replace(/,\s*,/g, ',').trim();

  return {
    sNo,
    reportingOfficer: reportingOfficer ? cleanText(reportingOfficer) : null,
    address:          address          ? cleanText(address)          : null,
    quantity,
    deliveryDays,
  };
}
