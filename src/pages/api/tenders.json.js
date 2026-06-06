import * as cheerio from 'cheerio';
import { PLANTS, isTenderActive, resolveTenderLocation } from '../../lib/plants.js';

export const prerender = false;
export const maxDuration = 30;

/** Pick the main tender PDF link from a table row (prefers full NIT & TenderDoc). */
function extractDocEventTarget($, tr) {
  const links = $(tr).find('a[href*="__doPostBack"]').toArray();
  const docs = links
    .map((a) => {
      const href = $(a).attr('href') || '';
      const label = $(a).text().trim();
      const match = href.match(/__doPostBack\('([^']+)'/);
      return match ? { label, eventTarget: match[1] } : null;
    })
    .filter(Boolean);

  const preferred =
    docs.find((d) => /nit\s*&\s*tenderdoc/i.test(d.label)) ||
    docs.find((d) => /^nit$/i.test(d.label)) ||
    docs[0];

  return preferred?.eventTarget || null;
}

/**
 * Parse CSPGCL date strings like "19/06/2026 04:00PM" into ISO format.
 * The portal uses DD/MM/YYYY HH:MMAM/PM — the old split-based parser
 * produced invalid ISO strings like "2026-06-19T04:00PM:00".
 */
function parseDate(d) {
  if (!d) return null;
  // Primary: match "DD/MM/YYYY HH:MM(AM|PM)"
  const match = d.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    const [, day, month, year, rawHr, min, meridiem] = match;
    let hr = parseInt(rawHr, 10);
    if (meridiem) {
      const isPM = meridiem.toUpperCase() === 'PM';
      if (isPM && hr !== 12) hr += 12;
      if (!isPM && hr === 12) hr = 0;
    }
    return `${year}-${month}-${day}T${String(hr).padStart(2, '0')}:${min}:00`;
  }
  // Fallback: native Date parse
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function GET() {
  let allTenders = [];
  let globalId = 1;

  for (const plant of PLANTS) {
    const url = `https://cspc.co.in/cspgcl_tendernotices/CSPGCL_Tender.aspx?paramflag=${plant.paramflag}`;

    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-IN,en;q=0.9',
        },
        signal: AbortSignal.timeout(25000),
      });
      if (!resp.ok) continue;
      const html = await resp.text();
      const $ = cheerio.load(html);

      const rows = $('#GVTenderDetails tr').toArray();

      rows.forEach((tr, i) => {
        if (i === 0) return;
        const tds = $(tr).find('td').toArray();
        if (tds.length < 8) return;

        const text = (el) => $(el).text().trim().replace(/\s+/g, ' ');

        const parseNum = (str) => {
          if (!str || str.toLowerCase() === 'nil' || str === '-') return null;
          const num = Number(str.replace(/[^0-9.]/g, ''));
          return isNaN(num) ? null : num;
        };

        const closingDate = parseDate(text(tds[6]));
        if (!isTenderActive(closingDate)) return;

        allTenders.push({
          sr_no: globalId++,
          plant_id: plant.id,
          plant_name: plant.label,
          paramflag: plant.paramflag,
          location: resolveTenderLocation(
            {
              scope_raw: text(tds[3]),
              tender_notice_no: text(tds[2]),
              issuing_office: text(tds[1]),
            },
            plant
          ),
          issuing_office: text(tds[1]),
          tender_notice_no: text(tds[2]),
          scope_raw: text(tds[3]),
          estimated_cost: parseNum(text(tds[4])),
          emd: parseNum(text(tds[5])),
          closing_date: closingDate,
          opening_date: parseDate(text(tds[7])),
          rfx_id: (() => {
            const last = text(tds[tds.length - 1]);
            if (!last || /^(NIT|Date Extension|Corrigendum|Tender Doc|General Terms|Amendment|Offline Tender|Tender cost|Tender Cast|Tender Specn)/i.test(last)) return null;
            return last;
          })(),
          doc_event_target: extractDocEventTarget($, tr),
          is_ebidding:
            $(tr).text().toLowerCase().includes('e-bidding') ||
            $(tr).text().toLowerCase().includes('eprocurement'),
        });
      });
    } catch (e) {
      console.error(`Error fetching ${url}:`, e);
    }
  }

  return new Response(JSON.stringify(allTenders), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
