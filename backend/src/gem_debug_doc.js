/**
 * gem_debug_doc.js — one-shot debug
 * Fetches exactly ONE page from GeM and dumps the raw Solr doc
 * so we can find the correct state field to filter on.
 *
 * Run: node src/gem_debug_doc.js
 */

import 'dotenv/config';
import { chromium } from 'playwright';

const GEM_BASE   = 'https://bidplus.gem.gov.in';
const SEARCH_URL = `${GEM_BASE}/advance-search`;
const BIDS_URL   = `${GEM_BASE}/search-bids`;

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const page = await context.newPage();

  console.log('Loading advance-search...');
  await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const csrf = await page.evaluate(() => {
    const chash = document.getElementById('chash');
    if (chash?.value?.length > 8) return chash.value;
    for (const s of document.querySelectorAll('script')) {
      const m = s.textContent.match(/'csrf_bd_gem_nk'\s*:\s*'([a-f0-9]{16,})'/i);
      if (m) return m[1];
    }
    return null;
  });
  console.log('CSRF:', csrf?.substring(0, 8));

  // ── Fetch page 1 with the CG state filter ──────────────────────────────────
  const json = await page.evaluate(async ({ bidsUrl, csrf }) => {
    const body = new URLSearchParams({
      searchType:      'location',
      state_name_con:  'CHHATTISGARH',
      city_name_con:   '',
      bidEndDateFrom:  '',
      bidEndDateTo:    '',
      page_no:         '1',
      csrf_bd_gem_nk:  csrf,
    });
    const resp = await fetch(bidsUrl, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With':  'XMLHttpRequest',
        Accept:              'application/json, text/javascript, */*; q=0.01',
        Origin:              location.origin,
        Referer:             location.href,
      },
      body: body.toString(),
    });
    return resp.json();
  }, { bidsUrl: BIDS_URL, csrf });

  const solr = json?.response?.response;
  console.log('\n── numFound:', solr?.numFound);
  console.log('\n── First raw doc (ALL fields):');
  console.log(JSON.stringify(solr?.docs?.[0], null, 2));

  // Also show all unique keys across the first 5 docs
  const keys = new Set();
  (solr?.docs ?? []).slice(0, 5).forEach(d => Object.keys(d).forEach(k => keys.add(k)));
  console.log('\n── All field names across first 5 docs:');
  console.log([...keys].sort().join('\n'));

  await browser.close();
})();
