/**
 * extractor/excelExporter.js
 *
 * Exports extracted GeM tender data to XLSX.
 * Uses the `xlsx` package (already installed in backend/package.json).
 *
 * Features:
 *   • Frozen header row
 *   • Auto-filter on all columns
 *   • Auto-sized column widths
 *   • One row per tender
 *   • Multi-consignee: comma-separated in a single row
 *   • ATC: category list + summary list as separate columns
 */

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// ── Column definitions ──────────────────────────────────────────────────────
// Each entry: { header, key, transform? }
// key is dot-notation path into the tender+aiExtract object.
const COLUMNS = [
  { header: 'Bid Number',                  key: 'bidNumber' },
  { header: 'Department',                  key: 'department' },
  { header: 'Ministry',                    key: 'ministry' },
  { header: 'Organisation',                key: 'organisation' },
  { header: 'Office',                      key: 'office' },
  { header: 'Item Category',               key: 'itemCategory' },
  { header: 'Quantity',                    key: 'quantity' },
  { header: 'Delivery Days',               key: 'deliveryDays' },
  { header: 'Bid Value (₹)',               key: 'bidValue' },
  { header: 'EMD Amount (₹)',              key: 'emdAmount' },
  { header: 'Bid Type',                    key: 'bidType' },
  { header: 'Bid to RA',                   key: 'bidToRA',       transform: boolStr },
  { header: 'Primary Product Category',    key: 'primaryProductCategory' },
  { header: 'Bid Start Date',              key: 'bidStartDate' },
  { header: 'Bid End Date',               key: 'bidEndDate' },
  { header: 'Bid Opening Date',            key: 'bidOpeningDate' },
  { header: 'Bidder Turnover (₹)',         key: 'eligibility.minAnnualTurnover' },
  { header: 'OEM Turnover (₹)',            key: 'eligibility.oemAverageTurnover' },
  { header: 'Experience (Years)',          key: 'eligibility.yearsOfExperience' },
  { header: 'MSE Exemption',              key: 'eligibility.mseExemption',          transform: boolStr },
  { header: 'Startup Exemption',          key: 'eligibility.startupExemption',       transform: boolStr },
  { header: 'MSE Purchase Preference',    key: 'eligibility.msePurchasePreference',  transform: boolStr },
  { header: 'Tech Clarification Days',    key: 'eligibility.technicalClarificationDays' },
  { header: 'Type of Bid',               key: 'eligibility.typeOfBid' },
  { header: 'Required Documents',         key: 'eligibility.documentsRequired',     transform: listStr },
  { header: 'Financial Criteria',         key: 'eligibility.financialCriteria' },
  { header: 'Technical Criteria',         key: 'eligibility.technicalCriteria' },
  { header: 'Consignee Officer(s)',        key: 'consignees',  transform: (arr) => mapList(arr, 'reportingOfficer') },
  { header: 'Consignee Address(es)',       key: 'consignees',  transform: (arr) => mapList(arr, 'address') },
  { header: 'Consignee Quantity',         key: 'consignees',  transform: (arr) => mapList(arr, 'quantity') },
  { header: 'Consignee Delivery Days',    key: 'consignees',  transform: (arr) => mapList(arr, 'deliveryDays') },
  { header: 'ATC Count',                  key: 'atc',         transform: (arr) => arr?.length ?? 0 },
  { header: 'ATC Categories',             key: 'atc',         transform: (arr) => mapList(arr, 'category') },
  { header: 'ATC Summaries',              key: 'atc',         transform: (arr) => mapList(arr, 'summary') },
  { header: 'Uploaded Documents',         key: 'uploadedDocuments', transform: (arr) => mapList(arr, 'name') },
  { header: 'Extraction Method',          key: '_extractionMethod' },
  { header: 'Warnings',                   key: 'warnings',    transform: listStr },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function boolStr(v) {
  if (v === true)  return 'Yes';
  if (v === false) return 'No';
  return '';
}

function listStr(arr) {
  if (!Array.isArray(arr)) return '';
  return arr.filter(Boolean).join('; ');
}

function mapList(arr, field) {
  if (!Array.isArray(arr)) return '';
  return arr.map((item) => item?.[field] ?? '').filter(Boolean).join(' | ');
}

/**
 * getNestedValue(obj, dotPath) → value
 * Supports up to 2 levels: "eligibility.minAnnualTurnover"
 */
function getNestedValue(obj, dotPath) {
  const parts = dotPath.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return null;
    cur = cur[part];
  }
  return cur ?? null;
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * exportToExcel(tenders, outputPath)
 *
 * tenders: Array of aiExtract objects (from parser.js output)
 *          Each should also have top-level bidValue, emdAmount etc.
 * outputPath: absolute path for the .xlsx file
 */
export function exportToExcel(tenders, outputPath) {
  if (!tenders || tenders.length === 0) {
    console.warn('[excelExporter] No tenders to export');
    return;
  }

  // ── Build rows ─────────────────────────────────────────────────────────
  const headerRow = COLUMNS.map((c) => c.header);

  const dataRows = tenders.map((tender) => {
    return COLUMNS.map(({ key, transform }) => {
      const raw = getNestedValue(tender, key);
      const value = transform ? transform(raw) : (raw ?? '');
      // Excel-safe: convert null/undefined to empty string
      return value == null ? '' : value;
    });
  });

  const wsData = [headerRow, ...dataRows];

  // ── Create workbook ────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto-width: measure max character length per column
  const colWidths = COLUMNS.map((col, colIdx) => {
    const maxLen = wsData.reduce((max, row) => {
      const cell = String(row[colIdx] ?? '');
      return Math.max(max, cell.length);
    }, col.header.length);
    return { wch: Math.min(maxLen + 2, 60) }; // cap at 60 chars
  });
  ws['!cols'] = colWidths;

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };

  // Auto-filter on header row
  ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(COLUMNS.length - 1)}1` };

  XLSX.utils.book_append_sheet(wb, ws, 'GeM Tenders');

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  XLSX.writeFile(wb, outputPath);
  console.log(`[excelExporter] Written ${tenders.length} rows → ${outputPath}`);
  return outputPath;
}

/**
 * generateExcelFilename() → string
 * e.g. "gem-extract-2026-07-07.xlsx"
 */
export function generateExcelFilename() {
  const date = new Date().toISOString().split('T')[0];
  return `gem-extract-${date}.xlsx`;
}
