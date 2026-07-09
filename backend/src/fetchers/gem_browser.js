/**
 * fetchers/gem_browser.js  (v7 — direct in-page fetch, no dropdown click/intercept)
 *
 * BACKGROUND
 *   • Calling /search-bids directly from Node (no browser) gets bot-blocked /
 *     ignores state_name_con — that's why this fetcher runs inside headless
 *     Chromium at all.
 *   • v5/v6 tried to reproduce a real user's dropdown click and intercept the
 *     resulting POST, falling back to a hand-guessed JSON-wrapped payload
 *     when interception missed. That fallback payload shape was never
 *     actually valid — GeM returns HTTP 500 for it — and the click/intercept
 *     path itself proved unreliable across states (timing-dependent).
 *
 * v7 APPROACH — simpler and verified:
 *   1. Open advance-search in headless Chromium just to establish a real
 *      browser session (cookies) and read the CSRF token — this alone is
 *      enough to get past GeM's bot detection.
 *   2. From then on, drive /search-bids with page.evaluate(fetch(...)) using
 *      the SAME URL-encoded payload shape GeM's own site uses
 *      (searchType=location, state_name_con, city_name_con, page_no,
 *      csrf_bd_gem_nk) — identical to fetchers/gem.js's payload, just sent
 *      through the browser's fetch so it carries the real session cookies.
 *   3. No dropdown click, no response interception, no guessed JSON payload.
 *
 * Each call to fetchGemTendersForState(stateName) opens/closes its own
 * browser instance so every state gets a completely fresh session — this
 * is what lets the caller fully finish one state (fetch -> DB -> PDFs ->
 * extraction) before moving on to the next, since GeM's PDFs themselves
 * don't reliably carry location data — the state used for THIS session is
 * the authoritative source of truth for where a tender belongs.
 *
 * OUTPUT: Same raw record shape as fetchers/gem.js#normalizeDoc() — pipeline unchanged.
 */

import { chromium } from 'playwright';

// ─── constants ───────────────────────────────────────────────────────────────

const GEM_BASE = 'https://bidplus.gem.gov.in';
const SEARCH_URL = `${GEM_BASE}/advance-search`;
const BIDS_URL = `${GEM_BASE}/search-bids`;
const PER_PAGE = 10;
const MAX_PAGES = 500;      // safety cap (~5 000 records) per state
const NAV_TIMEOUT = 90_000;  // ms — page navigation
const BETWEEN_MS = 900;     // polite inter-page delay (ms)
const MAX_PAGE_RETRIES = 3; // retries for a single transient page failure (e.g. HTTP 500)

/** "UTTAR PRADESH" -> "Uttar Pradesh" */
function titleCase(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Extract the CSRF token from the advance-search page's DOM/inline scripts. */
async function extractCsrf(page) {
  return page.evaluate(() => {
    const chash = document.getElementById('chash');
    if (chash?.value?.length > 8) return chash.value;

    for (const s of document.querySelectorAll('script')) {
      const m = s.textContent.match(/'csrf_bd_gem_nk'\s*:\s*'([a-f0-9]{16,})'/i);
      if (m) return m[1];
      const m2 = s.textContent.match(/csrf_bd_gem_nk["']?\s*[=:]\s*["']([a-f0-9]{16,})["']/i);
      if (m2) return m2[1];
    }
    for (const inp of document.querySelectorAll('input[type=hidden]')) {
      if (/^[a-f0-9]{32}$/.test(inp.value)) return inp.value;
    }
    return null;
  });
}

/** POST one page of /search-bids from inside the browser (real session cookies). */
async function fetchPage(page, { stateName, pageNo, csrf }) {
  return page.evaluate(
    async ({ bidsUrl, searchUrl, stateName, pageNo, csrf }) => {
      try {
        const body = new URLSearchParams({
          searchType: 'location',
          state_name_con: stateName,
          city_name_con: '',
          bidEndDateFrom: '',
          bidEndDateTo: '',
          page_no: String(pageNo),
          csrf_bd_gem_nk: csrf,
        });

        const resp = await fetch(bidsUrl, {
          method: 'POST',
          headers: {
            Accept: 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-IN,en;q=0.9',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Origin: location.origin,
            Referer: searchUrl,
          },
          body: body.toString(),
        });
        if (!resp.ok) return { __httpError: resp.status };
        return await resp.json();
      } catch (err) {
        return { __fetchError: err.message };
      }
    },
    { bidsUrl: BIDS_URL, searchUrl: SEARCH_URL, stateName, pageNo, csrf },
  );
}

/**
 * Fetch every GeM tender for a single state via headless browser.
 * @param {string} stateName - state name as it appears in GEM_STATES (e.g. 'CHHATTISGARH')
 */
export async function fetchGemTendersForState(stateName) {
  console.log(`[gem-browser] v7 — state=${stateName}`);
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
      viewport: { width: 1280, height: 900 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      extraHTTPHeaders: { 'Accept-Language': 'en-IN,en;q=0.9' },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const page = await context.newPage();

    // ── Step 1: Load advance-search — establishes a real session + cookies ──
    console.log(`[gem-browser] [${stateName}] loading advance-search page...`);
    await page.goto(SEARCH_URL, {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT,
    });

    let csrf = await extractCsrf(page);
    if (!csrf) throw new Error(`[gem-browser] [${stateName}] could not extract CSRF token`);
    console.log(`[gem-browser] [${stateName}] CSRF token acquired: ${csrf.substring(0, 8)}...`);

    // ── Step 2: Paginate via in-page fetch, using GeM's own payload shape ───
    const results = [];
    let totalFound = null;

    for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
      let json = null;
      let attempt = 0;

      while (attempt < MAX_PAGE_RETRIES) {
        attempt++;
        json = await fetchPage(page, { stateName, pageNo, csrf });

        if (json?.__httpError === 500 || json?.__fetchError) {
          const reason = json.__httpError ? `HTTP ${json.__httpError}` : json.__fetchError;
          console.warn(`[gem-browser] [${stateName}] page ${pageNo} attempt ${attempt}/${MAX_PAGE_RETRIES} failed: ${reason}`);
          if (attempt >= MAX_PAGE_RETRIES) break;
          // Refresh session (new CSRF) before retrying — a stale/consumed
          // CSRF token is the most common cause of a transient 500.
          await delay(1500 * attempt);
          try {
            await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
            const freshCsrf = await extractCsrf(page);
            if (freshCsrf) csrf = freshCsrf;
          } catch (_) { /* keep old csrf, retry anyway */ }
          continue;
        }
        break; // got a real (possibly error-shaped-but-non-retryable) response
      }

      if (json?.__httpError) {
        console.warn(`[gem-browser] [${stateName}] giving up on page ${pageNo} after ${attempt} attempts — HTTP ${json.__httpError}`);
        break;
      }
      if (json?.__fetchError) {
        console.warn(`[gem-browser] [${stateName}] giving up on page ${pageNo} after ${attempt} attempts — ${json.__fetchError}`);
        break;
      }

      const solr = json?.response?.response;
      if (!solr) {
        const snippet = JSON.stringify(json)?.substring(0, 300) ?? '(null)';
        console.warn(`[gem-browser] [${stateName}] unexpected response on page ${pageNo}:`, snippet);
        break;
      }

      if (totalFound === null) {
        totalFound = solr.numFound ?? 0;
        console.log(`[gem-browser] [${stateName}] totalFound = ${totalFound}`);
        if (totalFound === 0) break;
      }

      const docs = solr.docs ?? [];
      if (docs.length === 0) {
        console.log(`[gem-browser] [${stateName}] empty page — pagination complete`);
        break;
      }

      for (const doc of docs) {
        const rec = normalizeDoc(doc, stateName);
        if (rec) results.push(rec);
      }

      console.log(`[gem-browser] [${stateName}] page ${pageNo}: +${docs.length} → total ${results.length}/${totalFound}`);

      if (results.length >= totalFound) {
        console.log(`[gem-browser] [${stateName}] collected all expected records — done`);
        break;
      }
      if (docs.length < PER_PAGE) {
        // Partial page can legitimately be the last page.
        console.log(`[gem-browser] [${stateName}] partial page (${docs.length}/${PER_PAGE}) — treating as last page`);
        break;
      }
      if (results.length >= MAX_PAGES * PER_PAGE) break;

      await delay(BETWEEN_MS);
    }

    console.log(`[gem-browser] [${stateName}] done — ${results.length} total records`);
    return results;

  } finally {
    if (browser) await browser.close().catch(() => { });
  }
}

/** Backward-compatible default: Chhattisgarh only. */
export async function fetchGemTendersBrowser() {
  return fetchGemTendersForState('CHHATTISGARH');
}

// ─── normalisation ────────────────────────────────────────────────────────────

function arr(v) {
  return Array.isArray(v) ? v[0] : v;
}

function cleanTitle(title, category) {
  if (!title) return 'Custom Bid / BOQ';
  const isNumericGarbage = /^[\d,\s]+(\.\.\.)?$/.test(title) && (title.includes(',') || title.trim().length > 10);
  if (isNumericGarbage) {
    const cat = (category || '').toLowerCase();
    if (cat.includes('services')) {
      return 'Custom Bid for Services';
    } else if (cat.includes('boq')) {
      return 'BOQ Bid for Goods';
    } else {
      return 'Custom / BOQ Bid';
    }
  }
  return title;
}

function normalizeDoc(doc, fetchedState) {
  const bidNumber = arr(doc.b_bid_number);
  if (!bidNumber) return null;

  const category = arr(doc.b_cat_id) ?? 'General';
  let title = arr(doc.bd_category_name) || arr(doc.b_category_name) || bidNumber;
  title = cleanTitle(title, category);

  const startDate = arr(doc.final_start_date_sort) ?? null;
  const endDate = arr(doc.final_end_date_sort) ?? null;
  const status = arr(doc.b_status);
  const ministry = arr(doc.ba_official_details_minName) ?? null;
  const department = arr(doc.ba_official_details_deptName) ?? null;
  const bidType = arr(doc.b_bid_type);

  // City / district — read directly from Solr fields when GeM does provide
  // them (varies by listing). These are supplementary only: the state this
  // record was fetched under (this browser session's own state_name_con
  // filter) is always the authoritative locationState, since GeM's PDFs
  // themselves don't reliably carry location data — city resolution mostly
  // falls back to matching the state's own district list against the PDF
  // body text once the PDF is downloaded (see pipeline/locationResolve.js).
  const gemCity = arr(doc.ba_city_name) || arr(doc.b_city_name) || null;
  const gemDistrict = arr(doc.ba_district_name) || arr(doc.b_district_name) || null;
  const gemPincode = arr(doc.ba_pincode) || arr(doc.b_pincode) || null;

  const stateTitleCase = titleCase(fetchedState);
  const locationText = [gemCity, gemDistrict, gemPincode, stateTitleCase]
    .filter(Boolean)
    .join(', ');

  return {
    bidNumber,
    title: title.length > 300 ? title.substring(0, 297) + '...' : title,
    department: department || ministry || null,
    organization: ministry || null,
    category,
    quantity: arr(doc.b_total_quantity) != null ? String(arr(doc.b_total_quantity)) : null,
    startDate: startDate ? new Date(startDate).toISOString() : null,
    endDate: endDate ? new Date(endDate).toISOString() : null,
    locationText,
    gemCity,
    gemDistrict,
    gemPincode,
    fetchedState: stateTitleCase, // "UTTAR PRADESH" -> "Uttar Pradesh" — authoritative for folder + city scoping
    bidValue: null,
    emdAmount: null,
    bidLink: `${GEM_BASE}/showbidDocument/${encodeURIComponent(bidNumber)}`,
    isActive: status === 1,
    bidTypeLabel: bidType === 2 ? 'Reverse Auction' : 'Bid',
    gemId: arr(doc.b_id) ?? null,
  };
}
