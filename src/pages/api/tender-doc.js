import { PLANTS } from '../../lib/plants.js';

export const prerender = false;

const PORTAL_BASE = 'https://cspc.co.in/cspgcl_tendernotices/CSPGCL_Tender.aspx';
const EVENT_TARGET_RE = /^GVTenderDetails\$ctl\d+\$\w+/i;

function readHiddenField(html, name) {
  const m = html.match(new RegExp(`id="${name}" value="([^"]*)"`));
  return m ? m[1] : '';
}

export async function GET({ url }) {
  const paramflag = url.searchParams.get('paramflag');
  const target = url.searchParams.get('target');

  if (!paramflag || !target || !EVENT_TARGET_RE.test(target)) {
    return new Response('Invalid document request.', { status: 400 });
  }

  const plant = PLANTS.find(p => String(p.paramflag) === paramflag);
  if (!plant) {
    return new Response('Unknown plant source.', { status: 400 });
  }

  const pageUrl = `${PORTAL_BASE}?paramflag=${paramflag}`;

  try {
    const pageResp = await fetch(pageUrl);
    if (!pageResp.ok) {
      return new Response('Failed to reach CSPGCL portal.', { status: 502 });
    }

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
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: pageUrl,
      },
      body,
    });

    if (!docResp.ok) {
      return new Response('Document download failed.', { status: 502 });
    }

    const contentType = docResp.headers.get('content-type') || '';
    if (!contentType.includes('pdf')) {
      return new Response('Document not available.', { status: 404 });
    }

    const pdf = await docResp.arrayBuffer();
    const filename =
      docResp.headers.get('content-disposition')?.match(/filename=([^;]+)/i)?.[1]?.replace(/"/g, '') ||
      'tender-document.pdf';

    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    console.error('tender-doc error:', e);
    return new Response('Failed to fetch document.', { status: 500 });
  }
}
