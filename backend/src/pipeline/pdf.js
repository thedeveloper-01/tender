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
 *
 * For GEM tenders, PDFs are stored in state-scoped subdirectories:
 *   documents/GEM/CHHATTISGARH/<filename>.pdf
 *   documents/GEM/MAHARASHTRA/<filename>.pdf
 * This is critical because GeM PDFs lack reliable location data internally,
 * so folder organization is the source of truth for state assignment.
 */
export async function downloadPdf(tender) {
  ensureDir(config.documentsDir);

  let filePath;
  if (tender.source === 'GEM') {
    // State-scoped folder: documents/GEM/<STATE_UPPER>/
    const stateName = (tender.locationState || 'UNKNOWN').toUpperCase().replace(/\s+/g, '_');
    const stateDir = path.join(config.documentsDir, 'GEM', stateName);
    ensureDir(stateDir);
    const filename = `GEM-${sanitize(tender.bidNumber)}.pdf`;
    filePath = path.join(stateDir, filename);
  } else {
    const filename = `${tender.source}-${sanitize(tender.bidNumber)}.pdf`;
    filePath = path.join(config.documentsDir, filename);
  }

  if (fs.existsSync(filePath)) {
    console.log(`[pdf] file already exists, skipping download: ${filePath}`);
    return filePath;
  }

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
  // GEM PDF URL requires the NUMERIC internal ID (b_id / gemId from Solr).
  // The encoded bid-number URL (showbidDocument/GEM%2F...) always returns 404.
  // Confirmed by live inspection: showbidDocument/{numericId} → 200 + PDF.
  const gemId = tender.sourceMeta?.gemId;
  if (!gemId) {
    console.warn(`[pdf] GEM tender ${tender.bidNumber} has no gemId — cannot download PDF`);
    return null;
  }

  const GEM_BASE = 'https://bidplus.gem.gov.in';
  const pdfUrl = `${GEM_BASE}/showbidDocument/${gemId}`;

  let resp;
  try {
    resp = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,*/*',
        'Referer': `${GEM_BASE}/advance-search`,
      },
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    console.warn(`[pdf] fetch error for ${pdfUrl}:`, e.message);
    return null;
  }

  if (!resp.ok) {
    console.warn(`[pdf] GEM PDF ${pdfUrl} → HTTP ${resp.status}`);
    return null;
  }

  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.includes('pdf')) {
    console.warn(`[pdf] GEM PDF ${pdfUrl} → unexpected content-type: ${contentType}`);
    return null;
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(filePath, buf);
  console.log(`[pdf] saved ${buf.length} bytes → ${filePath}`);
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
