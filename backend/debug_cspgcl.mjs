import * as cheerio from 'cheerio';
import { parseCspgclDate } from './src/fetchers/cspgcl.js';

const PORTAL_BASE = 'https://cspc.co.in/cspgcl_tendernotices/CSPGCL_Tender.aspx';

const PLANTS = [
  { id: 'central',    paramflag: 1, label: 'Central Offices' },
  { id: 'korba-west', paramflag: 2, label: 'Hasdeo TPS — Korba West' },
  { id: 'dspm',      paramflag: 3, label: 'Dr. Shyama Prasad Mukharjee TPS' },
  { id: 'marwa',     paramflag: 4, label: 'Atal Bihari Vajpayee TPS — Marwa' },
  { id: 'marwa-5',   paramflag: 5, label: 'paramflag=5 (check if exists)' },
];

const today = new Date();
today.setHours(0, 0, 0, 0);

let grandTotal = 0, grandOpen = 0, grandClosed = 0, grandNoDate = 0;

for (const plant of PLANTS) {
  const url = `${PORTAL_BASE}?paramflag=${plant.paramflag}`;
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
      signal: AbortSignal.timeout(25000),
    });

    const html = await resp.text();
    const $ = cheerio.load(html);
    const rows = $('#GVTenderDetails tr').toArray();

    let total = 0, open = 0, closed = 0, noDate = 0;

    rows.forEach((tr, i) => {
      if (i === 0) return; // skip header
      const tds = $(tr).find('td').toArray();
      if (tds.length < 8) return; // skip sub-rows (link rows)

      total++;
      const text = (el) => $(el).text().trim().replace(/\s+/g, ' ');
      const closingRaw = text(tds[6]);
      const closingDate = parseCspgclDate(closingRaw);

      if (!closingDate) {
        noDate++;
      } else {
        const closing = new Date(closingDate);
        closing.setHours(0, 0, 0, 0);
        if (closing >= today) {
          open++;
        } else {
          closed++;
        }
      }
    });

    grandTotal += total; grandOpen += open; grandClosed += closed; grandNoDate += noDate;

    console.log(`\n[paramflag=${plant.paramflag}] ${plant.label}`);
    console.log(`  Total rows : ${total}`);
    console.log(`  Open       : ${open}  ← closing date >= today`);
    console.log(`  Closed     : ${closed}  ← closing date < today`);
    console.log(`  No date    : ${noDate}`);

  } catch (e) {
    console.log(`\n[paramflag=${plant.paramflag}] ${plant.label}`);
    console.log(`  ERROR: ${e.message}`);
  }

  await new Promise(r => setTimeout(r, 500));
}

console.log('\n══════════════════════════════════════');
console.log('  GRAND TOTAL (all plants)');
console.log(`  Total      : ${grandTotal}`);
console.log(`  Open       : ${grandOpen}`);
console.log(`  Closed     : ${grandClosed}`);
console.log(`  No date    : ${grandNoDate}`);
console.log('══════════════════════════════════════');
