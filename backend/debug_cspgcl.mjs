import { PLANTS } from './src/fetchers/cspgcl.js';
import * as cheerio from 'cheerio';
import { parseCspgclDate } from './src/fetchers/cspgcl.js';

const PORTAL_BASE = 'https://cspc.co.in/cspgcl_tendernotices/CSPGCL_Tender.aspx';

for (const plant of PLANTS) {
  const url = `${PORTAL_BASE}?paramflag=${plant.paramflag}`;
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(20000),
    });
    const html = await resp.text();
    const $ = cheerio.load(html);
    const rows = $('#GVTenderDetails tr').toArray();
    const dataRows = rows.filter((tr, i) => {
      if (i === 0) return false;
      return $(tr).find('td').toArray().length >= 8;
    });
    console.log(`paramflag=${plant.paramflag} (${plant.label}): ${rows.length - 1} total rows, ${dataRows.length} data rows`);
  } catch (e) {
    console.error(`paramflag=${plant.paramflag}: ERROR - ${e.message}`);
  }
}
