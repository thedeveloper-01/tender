/**
 * fetchers/gem_browser.js  (v3 — exact CSRF extraction + in-browser fetch)
 *
 * WHY: GeM's /search-bids API blocks raw Node.js HTTP clients (bot-detection).
 *
 * HOW:
 *   1. Open advance-search in headless Chromium — gets all session cookies.
 *   2. Extract CSRF token from the page via the known hidden inputs:
 *        <input id="cname"  value="csrf_bd_gem_nk">
 *        <input id="chash"  value="<actual token>">
 *      (confirmed by live page inspection)
 *   3. For each page call page.evaluate() to run window.fetch() inside the
 *      browser's own JS context, so the browser's cookie jar is used
 *      automatically — no manual cookie extraction needed.
 *
 * OUTPUT: Same raw record shape as gem.js#normalizeDoc() — pipeline unchanged.
 */

import { chromium } from 'playwright';

// ─── constants ───────────────────────────────────────────────────────────────

const GEM_BASE    = 'https://bidplus.gem.gov.in';
const SEARCH_URL  = `${GEM_BASE}/advance-search`;
const BIDS_URL    = `${GEM_BASE}/search-bids`;
const PER_PAGE    = 10;
const MAX_PAGES   = 200;    // safety cap (~2 000 records)
const NAV_TIMEOUT = 60_000; // ms — page navigation
const BETWEEN_MS  = 800;    // polite inter-page delay (ms)

// ─── public entry point ──────────────────────────────────────────────────────

export async function fetchGemTendersBrowser() {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--window-size=1280,900',
      ],
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/124.0.0.0 Safari/537.36',
      viewport:         { width: 1280, height: 900 },
      locale:           'en-IN',
      timezoneId:       'Asia/Kolkata',
      extraHTTPHeaders: { 'Accept-Language': 'en-IN,en;q=0.9' },
    });

    // Remove webdriver automation flag
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const page = await context.newPage();

    // ── Step 1: Load advance-search (warms up cookies) ────────────────────
    console.log('[gem-browser] loading advance-search page...');
    await page.goto(SEARCH_URL, {
      waitUntil: 'domcontentloaded',
      timeout:   NAV_TIMEOUT,
    });
    console.log('[gem-browser] page loaded (title:', await page.title() + ')');

    // ── Step 2: Extract CSRF token ────────────────────────────────────────
    // GEM stores it in two hidden inputs:
    //   <input id="cname"  value="csrf_bd_gem_nk">   ← key name
    //   <input id="chash"  value="<hex token>">       ← actual value
    const csrf = await page.evaluate(() => {
      // Primary: hidden input #chash (confirmed by live inspection)
      const chash = document.getElementById('chash');
      if (chash && chash.value && chash.value.length > 8) return chash.value;

      // Fallback 1: scan inline scripts for the token pattern
      // GEM embeds it as: 'csrf_bd_gem_nk': 'df33...'
      for (const s of document.querySelectorAll('script')) {
        const m = s.textContent.match(/'csrf_bd_gem_nk'\s*:\s*'([a-f0-9]{16,})'/i);
        if (m) return m[1];
        // Also try double-quote or assignment variant
        const m2 = s.textContent.match(/csrf_bd_gem_nk["']?\s*[=:]\s*["']([a-f0-9]{16,})["']/i);
        if (m2) return m2[1];
      }

      // Fallback 2: any hidden input whose value looks like a 32-char hex token
      for (const inp of document.querySelectorAll('input[type=hidden]')) {
        if (/^[a-f0-9]{32}$/.test(inp.value)) return inp.value;
      }

      return null;
    });

    if (!csrf) {
      throw new Error('[gem-browser] could not extract CSRF token from page');
    }
    console.log(`[gem-browser] CSRF token acquired: ${csrf.substring(0, 8)}...`);

    // ── Step 3: Paginate using in-browser fetch() ─────────────────────────
    const results  = [];
    let totalFound = null;

    for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
      console.log(`[gem-browser] fetching page ${pageNo}...`);

      let json;
      try {
        // page.evaluate() runs inside the Playwright browser — the browser's
        // cookies & session are used automatically by fetch()
        json = await page.evaluate(
          async ({ bidsUrl, pageNo, csrf }) => {
            try {
              const body = new URLSearchParams({
                searchType:     'location',
                state_name_con: 'CHHATTISGARH',
                city_name_con:  '',
                bidEndDateFrom: '',
                bidEndDateTo:   '',
                page_no:        String(pageNo),
                csrf_bd_gem_nk: csrf,
              });

              const resp = await fetch(bidsUrl, {
                method:  'POST',
                headers: {
                  'Content-Type':     'application/x-www-form-urlencoded; charset=UTF-8',
                  'X-Requested-With': 'XMLHttpRequest',
                  Accept:             'application/json, text/javascript, */*; q=0.01',
                  'Accept-Language':  'en-IN,en;q=0.9',
                  Origin:             location.origin,
                  Referer:            location.href,
                },
                body: body.toString(),
              });

              if (!resp.ok) return { __httpError: resp.status };
              return await resp.json();
            } catch (err) {
              return { __fetchError: err.message };
            }
          },
          { bidsUrl: BIDS_URL, pageNo, csrf },
        );
      } catch (evalErr) {
        console.warn(`[gem-browser] evaluate error on page ${pageNo}:`, evalErr.message);
        break;
      }

      // Handle error responses
      if (json?.__httpError) {
        console.warn(`[gem-browser] HTTP ${json.__httpError} on page ${pageNo}`);
        break;
      }
      if (json?.__fetchError) {
        console.warn(`[gem-browser] fetch error on page ${pageNo}:`, json.__fetchError);
        break;
      }

      const solr = json?.response?.response;
      if (!solr) {
        // Log a short snippet of the unexpected response for diagnosis
        const snippet = JSON.stringify(json)?.substring(0, 300) ?? '(null)';
        console.warn(`[gem-browser] unexpected response shape on page ${pageNo}:`, snippet);
        break;
      }

      if (totalFound === null) {
        totalFound = solr.numFound ?? 0;
        console.log(`[gem-browser] totalFound = ${totalFound}`);
      }

      const docs = solr.docs ?? [];
      if (docs.length === 0) {
        console.log('[gem-browser] empty page — pagination complete');
        break;
      }

      for (const doc of docs) {
        const rec = normalizeDoc(doc);
        if (rec) results.push(rec);
      }

      console.log(`[gem-browser] page ${pageNo}: +${docs.length} → total ${results.length}/${totalFound}`);

      // Stop when we have everything
      if (results.length >= Math.min(totalFound ?? Infinity, MAX_PAGES * PER_PAGE)) break;
      if (docs.length < PER_PAGE) break; // last partial page

      await delay(BETWEEN_MS);
    }

    console.log(`[gem-browser] done — ${results.length} total records`);
    return results;

  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ─── normalisation ────────────────────────────────────────────────────────────

/** Unwrap Solr array-wrapped field values. */
function arr(v) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Convert a raw Solr document into the standard shape consumed by normalizeGem().
 * Must stay in sync with fetchers/gem.js#normalizeDoc().
 */
function normalizeDoc(doc) {
  const bidNumber = arr(doc.b_bid_number);
  if (!bidNumber) return null;

  const title =
    arr(doc.bd_category_name) || arr(doc.b_category_name) || bidNumber;

  const startDate  = arr(doc.final_start_date_sort) ?? null;
  const endDate    = arr(doc.final_end_date_sort)   ?? null;
  const status     = arr(doc.b_status);
  const ministry   = arr(doc.ba_official_details_minName)  ?? null;
  const department = arr(doc.ba_official_details_deptName) ?? null;
  const bidType    = arr(doc.b_bid_type);

  return {
    bidNumber,
    title:        title.length > 300 ? title.substring(0, 297) + '...' : title,
    department:   department || ministry || null,
    organization: ministry || null,
    category:     arr(doc.b_cat_id) ?? 'General',
    quantity:     arr(doc.b_total_quantity) != null
                    ? String(arr(doc.b_total_quantity))
                    : null,
    startDate:    startDate ? new Date(startDate).toISOString() : null,
    endDate:      endDate   ? new Date(endDate).toISOString()   : null,
    locationText: 'CHHATTISGARH',
    bidValue:     null,  // not in listing results — extracted from detail PDF
    emdAmount:    null,
    bidLink:      `${GEM_BASE}/showbidDocument/${encodeURIComponent(bidNumber)}`,
    isActive:     status === 1,
    bidTypeLabel: bidType === 2 ? 'Reverse Auction' : 'Bid',
    gemId:        arr(doc.b_id) ?? null,
  };
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
