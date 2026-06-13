import * as cheerio from 'cheerio';
import { PLANTS, resolveTenderLocation } from '../plants.js';

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
 */
function parseDate(d) {
  if (!d) return null;
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
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Fetch and parse all active tenders from the CSPGCL portal pages.
 */
export async function fetchCspgclTenders() {
  let allTenders = [];

  for (const plant of PLANTS) {
    const url = `https://cspc.co.in/cspgcl_tendernotices/CSPGCL_Tender.aspx?paramflag=${plant.paramflag}`;
    console.log(`[CSPGCL Fetcher] Scraping portal for plant: ${plant.label}`);

    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-IN,en;q=0.9',
        },
        signal: AbortSignal.timeout(25000),
      });
      if (!resp.ok) {
        console.error(`[CSPGCL Fetcher] Failed to fetch ${plant.label}: HTTP ${resp.status}`);
        continue;
      }
      
      const html = await resp.text();
      const $ = cheerio.load(html);
      const rows = $('#GVTenderDetails tr').toArray();

      rows.forEach((tr, i) => {
        if (i === 0) return; // Skip header row
        const tds = $(tr).find('td').toArray();
        if (tds.length < 8) return;

        const text = (el) => $(el).text().trim().replace(/\s+/g, ' ');

        const parseNum = (str) => {
          if (!str || str.toLowerCase() === 'nil' || str === '-') return null;
          const num = Number(str.replace(/[^0-9.]/g, ''));
          return isNaN(num) ? null : num;
        };

        const closingDateStr = text(tds[6]);
        const closingDateIso = parseDate(closingDateStr);

        const scopeRaw = text(tds[3]);
        const noticeNo = text(tds[2]);
        const issuingOffice = text(tds[1]);

        // Resolve location city
        const locationCity = resolveTenderLocation(
          {
            scope_raw: scopeRaw,
            tender_notice_no: noticeNo,
            issuing_office: issuingOffice,
          },
          plant
        );

        // Standardized bid number
        const bidNumber = noticeNo || `CSPGCL-${plant.id}-${i}`;

        allTenders.push({
          bidNumber,
          title: scopeRaw || `Tender from ${issuingOffice}`,
          department: 'Chhattisgarh State Power Generation Company Limited (CSPGCL)',
          organization: issuingOffice,
          startDate: parseDate(text(tds[7])) ? new Date(parseDate(text(tds[7]))) : null,
          endDate: closingDateIso ? new Date(closingDateIso) : null,
          bidValue: parseNum(text(tds[4])),
          emdAmount: parseNum(text(tds[5])),
          bidLink: url,
          locationCity,
          sourceMeta: {
            plant_id: plant.id,
            plant_name: plant.label,
            paramflag: plant.paramflag,
            rfx_id: (() => {
              const last = text(tds[tds.length - 1]);
              if (!last || /^(NIT|Date Extension|Corrigendum|Tender Doc|General Terms|Amendment|Offline Tender|Tender cost|Tender Cast|Tender Specn)/i.test(last)) return null;
              return last;
            })(),
            doc_event_target: extractDocEventTarget($, tr),
            is_ebidding:
              $(tr).text().toLowerCase().includes('e-bidding') ||
              $(tr).text().toLowerCase().includes('eprocurement'),
          },
          rawJson: {
            closing_date_raw: closingDateStr,
            opening_date_raw: text(tds[7]),
          }
        });
      });
    } catch (e) {
      console.error(`[CSPGCL Fetcher] Error fetching ${plant.label}:`, e);
    }
  }

  return allTenders;
}
