import * as cheerio from 'cheerio';

/** CSPGCL tender portal — Central Offices + one page per power station. */
export const PLANTS = [
  { id: 'central', paramflag: 1, label: 'Central Offices' },
  { id: 'korba-west', paramflag: 2, label: 'Hasdeo TPS — Korba West' },
  { id: 'dspm', paramflag: 3, label: 'Dr. Shyama Prasad Mukharjee TPS' },
  { id: 'marwa', paramflag: 5, label: 'Atal Bihari Vajpayee TPS — Marwa' },
];

const PORTAL_BASE = 'https://cspc.co.in/cspgcl_tendernotices/CSPGCL_Tender.aspx';

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
 * Parse CSPGCL date strings like "19/06/2026 04:00PM" (DD/MM/YYYY HH:MMAM/PM)
 * into a JS Date. Returns null on failure.
 */
export function parseCspgclDate(d) {
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
    const iso = `${year}-${month}-${day}T${String(hr).padStart(2, '0')}:${min}:00+05:30`;
    const date = new Date(iso);
    return isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function isTenderActive(closingDate) {
  if (!closingDate) return true;
  const closing = new Date(closingDate);
  if (isNaN(closing.getTime())) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  closing.setHours(0, 0, 0, 0);
  return closing >= today;
}

/**
 * fetchCspgclTenders() -> raw record array
 * Shape: { tenderNoticeNo, scopeRaw, issuingOffice, estimatedCost, emd,
 *          closingDate, openingDate, plantId, paramflag, rfxId,
 *          docEventTarget, isEbidding }
 */
export async function fetchCspgclTenders() {
  const allTenders = [];

  for (const plant of PLANTS) {
    const url = `${PORTAL_BASE}?paramflag=${plant.paramflag}`;

    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

        const closingDate = parseCspgclDate(text(tds[6]));

        const scopeRaw = text(tds[3]);
        const tenderNoticeNo = text(tds[2]);
        const issuingOffice = text(tds[1]);

        const rfxIdRaw = (() => {
          const last = text(tds[tds.length - 1]);
          if (!last || /^(NIT|Date Extension|Corrigendum|Tender Doc|General Terms|Amendment|Offline Tender|Tender cost|Tender Cast|Tender Specn)/i.test(last)) return null;
          return last;
        })();

        allTenders.push({
          tenderNoticeNo,
          scopeRaw,
          issuingOffice,
          estimatedCost: parseNum(text(tds[4])),
          emd: parseNum(text(tds[5])),
          closingDate,
          openingDate: parseCspgclDate(text(tds[7])),
          plantId: plant.id,
          plantLabel: plant.label,
          paramflag: plant.paramflag,
          rfxId: rfxIdRaw,
          docEventTarget: extractDocEventTarget($, tr),
          isEbidding:
            $(tr).text().toLowerCase().includes('e-bidding') ||
            $(tr).text().toLowerCase().includes('eprocurement'),
        });
      });

      // small delay between requests to be polite to the portal
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.error(`[cspgcl] error fetching ${url}:`, e.message);
    }
  }

  return allTenders;
}
