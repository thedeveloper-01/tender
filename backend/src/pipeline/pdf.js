import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

export const CSPGCL_PORTAL_BASE = 'https://cspc.co.in/cspgcl_tendernotices/CSPGCL_Tender.aspx';

const EVENT_TARGET_RE = /^GVTenderDetails\$ctl\d+\$\w+/i;

function readHiddenField(html, name) {
  const m = html.match(new RegExp(`id="${name}" value="([^"]*)"`));
  return m ? m[1] : '';
}

function sanitize(str) {
  return String(str).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * downloadPdf(tender) -> relative filePath | null
 * tender: normalized unified tender object (pre-save)
 */
export async function downloadPdf(tender) {
  ensureDir(config.documentsDir);
  const filename = `${tender.source}-${sanitize(tender.bidNumber)}.pdf`;
  const filePath = path.join(config.documentsDir, filename);

  try {
    if (tender.source === 'GEM') {
      return await downloadGemPdf(tender, filePath);
    }
    if (tender.source === 'CSPGCL') {
      return await downloadCspgclPdf(tender, filePath);
    }
  } catch (e) {
    console.error(`[pdf] download failed for ${tender.source}/${tender.bidNumber}:`, e.message);
  }
  return null;
}

async function downloadGemPdf(tender, filePath) {
  if (!tender.bidLink) return null;
  const resp = await fetch(tender.bidLink, {
    headers: { 'User-Agent': 'Mozilla/5.0 CGTenders-Bot/1.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) return null;
  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.includes('pdf')) return null;

  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(filePath, buf);
  return filePath;
}

async function downloadCspgclPdf(tender, filePath) {
  const meta = tender.sourceMeta || {};
  const target = meta.docEventTarget;
  if (!target || !EVENT_TARGET_RE.test(target)) return null;

  const pageUrl = `${CSPGCL_PORTAL_BASE}?paramflag=${meta.paramflag}`;
  const pageResp = await fetch(pageUrl, { signal: AbortSignal.timeout(25000) });
  if (!pageResp.ok) return null;
  const html = await pageResp.text();

  const body = new URLSearchParams({
    __EVENTTARGET: target,
    __EVENTARGUMENT: '',
    __VIEWSTATE: readHiddenField(html, '__VIEWSTATE'),
    __VIEWSTATEGENERATOR: readHiddenField(html, '__VIEWSTATEGENERATOR'),
    __EVENTVALIDATION: readHiddenField(html, '__EVENTVALIDATION'),
  });

  const docResp = await fetch(pageUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: pageUrl },
    body,
    signal: AbortSignal.timeout(30000),
  });
  if (!docResp.ok) return null;

  const contentType = docResp.headers.get('content-type') || '';
  if (!contentType.includes('pdf')) return null;

  const buf = Buffer.from(await docResp.arrayBuffer());
  fs.writeFileSync(filePath, buf);
  return filePath;
}

/** Delete a tender's PDF file from disk if it exists. */
export function deletePdf(pdfPath) {
  if (!pdfPath) return;
  try {
    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
  } catch (e) {
    console.error('[pdf] delete failed:', e.message);
  }
}
