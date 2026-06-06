import * as cheerio from 'cheerio';
import { PLANTS, isTenderActive, resolveTenderLocation } from '../../lib/plants.js';

export const prerender = false;

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

export async function GET() {
  let allTenders = [];
  let globalId = 1;

  for (const plant of PLANTS) {
    const url = `https://cspc.co.in/cspgcl_tendernotices/CSPGCL_Tender.aspx?paramflag=${plant.paramflag}`;

    try {
      const resp = await fetch(url);
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

        const parseDate = (d) => {
          if (!d) return null;
          const parts = d.split(/[ \/:]/);
          if (parts.length >= 3) {
            return `${parts[2]}-${parts[1]}-${parts[0]}T${parts[3] || '00'}:${parts[4] || '00'}:00`;
          }
          return d;
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
          // RFX/Remark is always the LAST td (index 14 or 15 when Date Extension present)
          rfx_id: (() => {
            const last = text(tds[tds.length - 1]);
            // Skip if it looks like a doc label (NIT, Date Extension, Corrigendum, etc.)
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
