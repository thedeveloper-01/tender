/**
 * fetchers/gem_browser.js  (v6 — parameterized by state, one state per call)
 *
 * ROOT CAUSE (discovered by live inspection):
 *   • The GeM /search-bids API completely ignores state_name_con in the POST body
 *     when called directly — numFound=44728 regardless of state sent.
 *   • The state dropdown options are NOT loaded on page load; they appear only
 *     after the user clicks the dropdown (lazy AJAX).
 *
 * CORRECT APPROACH:
 *   1. Open advance-search in headless Chromium.
 *   2. Click #state_name_con to trigger its lazy option load.
 *   3. Wait for the requested state's option to appear, then select it.
 *   4. Click .btn-search — this POSTs to /search-bids with state scoped in session.
 *   5. Capture the page-1 response from that POST (intercepted via Playwright).
 *   6. Pages 2-N: send only page_no + csrf — session holds the state filter.
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
const BETWEEN_MS = 1_200;   // polite inter-page delay (ms)

/** "UTTAR PRADESH" -> "Uttar Pradesh" */
function titleCase(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Fetch every GeM tender for a single state via headless browser.
 * @param {string} stateName - state name as it appears in GEM_STATES (e.g. 'CHHATTISGARH')
 */
export async function fetchGemTendersForState(stateName) {
  console.log(`[gem-browser] v6 — state=${stateName}`);
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

    // ── Step 1: Load advance-search ────────────────────────────────────────
    console.log(`[gem-browser] [${stateName}] loading advance-search page...`);
    await page.goto(SEARCH_URL, {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT,
    });

    // ── Step 2: Extract CSRF token ─────────────────────────────────────────
    const csrf = await page.evaluate(() => {
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

    if (!csrf) throw new Error(`[gem-browser] [${stateName}] could not extract CSRF token`);
    console.log(`[gem-browser] [${stateName}] CSRF token acquired: ${csrf.substring(0, 8)}...`);

    // ── Step 3: Click Location Tab to reveal state dropdown ──────────────
    console.log(`[gem-browser] [${stateName}] clicking "Search by Consignee Location" tab...`);
    await page.locator('a', { hasText: 'Search by Consignee Location' }).click();

    console.log(`[gem-browser] [${stateName}] clicking state dropdown to load options...`);
    const stateDropdown = page.locator('#state_name_con');
    await stateDropdown.waitFor({ state: 'visible', timeout: 15_000 });
    await stateDropdown.click();

    // Wait until at least one option other than "--Select--" appears
    await page.waitForFunction(
      () => document.querySelector('#state_name_con')?.options?.length > 1,
      { timeout: 20_000 },
    );

    // ── Step 4: Find the requested state in the dropdown ───────────────────
    const stateOption = await page.evaluate((wantedState) => {
      const sel = document.getElementById('state_name_con');
      const norm = (s) => s.trim().toLowerCase();
      for (const opt of sel.options) {
        if (norm(opt.text) === norm(wantedState)) return { val: opt.value, text: opt.text };
      }
      // fallback: substring match (handles minor punctuation/spacing differences)
      for (const opt of sel.options) {
        if (norm(opt.text).includes(norm(wantedState)) || norm(wantedState).includes(norm(opt.text))) {
          return { val: opt.value, text: opt.text };
        }
      }
      return { notFound: true, all: [...sel.options].map((o) => o.text) };
    }, stateName);

    if (stateOption.notFound) {
      throw new Error(
        `[gem-browser] [${stateName}] not found in state dropdown. Options: ${stateOption.all?.join(', ')}`
      );
    }
    console.log(`[gem-browser] [${stateName}] found option: value="${stateOption.val}" text="${stateOption.text}"`);

    const searchBidsResponsePromise = page.waitForResponse(
      (r) => r.url().includes('/search-bids') && r.request().method() === 'POST',
      { timeout: 30_000 },
    );

    // Select the option and click search using page.evaluate to ensure GeM's jQuery/Select2 registers the change
    await page.evaluate((val) => {
      const stateSelect = document.getElementById('state_name_con');
      if (stateSelect) {
        stateSelect.value = val;
        if (typeof jQuery !== 'undefined') {
          jQuery(stateSelect).trigger('change');
        } else {
          stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }, stateOption.val);

    // Click the specific search button for the Location form
    await page.locator('form#location-search a.advance-btn').first().click();
    console.log(`[gem-browser] [${stateName}] search button clicked — waiting for /search-bids response...`);

    // ── Step 6: Capture page-1 results from the form submit ────────────────
    const results = [];
    let totalFound = null;
    let startPageNo = 2; // default: page 1 already handled by form submit

    let firstJson = null;
    try {
      const firstResp = await searchBidsResponsePromise;
      firstJson = await firstResp.json().catch(() => null);
    } catch (e) {
      console.warn(`[gem-browser] [${stateName}] could not intercept form-submit response:`, e.message);
    }

    if (firstJson?.response?.response) {
      const solr = firstJson.response.response;
      totalFound = solr.numFound ?? 0;
      console.log(`[gem-browser] [${stateName}] totalFound = ${totalFound}`);

      const docs = solr.docs ?? [];
      for (const doc of docs) {
        const rec = normalizeDoc(doc, stateName);
        if (rec) results.push(rec);
      }
      console.log(`[gem-browser] [${stateName}] page 1 (form submit): +${docs.length} → total ${results.length}/${totalFound}`);

      if (docs.length === 0) {
        console.log(`[gem-browser] [${stateName}] page 1 returned 0 docs — done`);
        return results;
      }
      // Note: if page 1 is partial (<PER_PAGE), continue pagination — don't
      // exit early, there may be more pages (partial pages can occur mid-run).
    } else {
      // Fallback: no intercepted response — start pagination from page 1
      console.warn(`[gem-browser] [${stateName}] no intercepted response from form submit — starting from page 1`);
      startPageNo = 1;
    }

    // ── Step 7: Paginate (pages 2-N) using session-scoped fetch ────────────
    // After the form submit above, the server session is scoped to this state.
    // We only need to send page_no + csrf — the session holds the filter.
    for (let pageNo = startPageNo; pageNo <= MAX_PAGES; pageNo++) {
      let json;
      try {
        json = await page.evaluate(
          async ({ bidsUrl, pageNo, csrf, stateName }) => {
            try {
              const payloadStr = JSON.stringify({
                searchType: 'con',
                state_name_con: stateName,
                city_name_con: '',
                bidEndFromCon: '',
                bidEndToCon: '',
                page: pageNo,
              });

              const body = new URLSearchParams({
                payload: payloadStr,
                csrf_bd_gem_nk: csrf,
              });
              const resp = await fetch(bidsUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                  'X-Requested-With': 'XMLHttpRequest',
                  Accept: 'application/json, text/javascript, */*; q=0.01',
                  'Accept-Language': 'en-IN,en;q=0.9',
                  Origin: location.origin,
                  Referer: location.href,
                },
                body: body.toString(),
              });
              if (!resp.ok) return { __httpError: resp.status };
              return await resp.json();
            } catch (err) {
              return { __fetchError: err.message };
            }
          },
          { bidsUrl: BIDS_URL, pageNo, csrf, stateName },
        );
      } catch (evalErr) {
        console.warn(`[gem-browser] [${stateName}] evaluate error on page ${pageNo}:`, evalErr.message);
        break;
      }

      if (json?.__httpError) {
        console.warn(`[gem-browser] [${stateName}] HTTP ${json.__httpError} on page ${pageNo}`);
        break;
      }
      if (json?.__fetchError) {
        console.warn(`[gem-browser] [${stateName}] fetch error on page ${pageNo}:`, json.__fetchError);
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

      // Stop when we have collected all expected records
      if (totalFound !== null && results.length >= totalFound) {
        console.log(`[gem-browser] [${stateName}] collected all expected records — done`);
        break;
      }
      // Hard cap safety
      if (results.length >= MAX_PAGES * PER_PAGE) break;

      // NOTE: Do NOT break on docs.length < PER_PAGE — a partial page can
      // occur mid-run (transient / rate-limit) and still have more pages after.
      // Only break on a truly empty page (handled above).

      await delay(BETWEEN_MS);
    }

    console.log(`[gem-browser] [${stateName}] done — ${results.length} total records`);
    return results;

  } finally {
    if (browser) await browser.close().catch(() => {});
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
  // record was fetched under (the browser session's own selected state) is
  // always the authoritative locationState, since GeM's PDFs themselves
  // don't reliably carry location data — city resolution mostly falls back
  // to matching the state's own district list against the PDF body text
  // once the PDF is downloaded (see pipeline/locationResolve.js).
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

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
