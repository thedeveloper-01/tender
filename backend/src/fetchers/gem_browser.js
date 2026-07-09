/**
 * fetchers/gem_browser.js  (v6 — click-to-load dropdown + all-India state loop)
 *
 * ROOT CAUSE (discovered by live inspection):
 *   • The GeM /search-bids API completely ignores state_name_con in the POST body
 *     when called directly — numFound=44728 regardless of state sent.
 *   • The state dropdown options are NOT loaded on page load; they appear only
 *     after the user clicks the dropdown (lazy AJAX).
 *
 * CORRECT APPROACH (repeated for every state in GEM_STATES):
 *   1. Open advance-search in headless Chromium (once).
 *   2. Click #state_name_con to trigger its lazy option load (once).
 *   3. For each state: select it in the dropdown, click .btn-search — this
 *      POSTs to /search-bids with that state scoped in session.
 *   4. Capture the page-1 response from that POST (intercepted via Playwright).
 *   5. Pages 2-N: send page_no + csrf + state_name_con — session holds the filter.
 *   6. Move to the next state and repeat.
 *
 * Every record is tagged with `fetchedState` (same convention as gem.js) so the
 * pipeline can bucket PDFs / DB rows per state — see pipeline/pdf.js which
 * already saves into documents/GEM/<STATE>/ using this field.
 *
 * OUTPUT: Same raw record shape as gem.js#normalizeDoc() — pipeline unchanged.
 */

console.log('[gem-browser] v6 — click-dropdown + all-India state loop');

import { chromium } from 'playwright';
import { GEM_STATES } from './gem.js'; // reuse the single source of truth for all-India states

// ─── constants ───────────────────────────────────────────────────────────────

const GEM_BASE = 'https://bidplus.gem.gov.in';
const SEARCH_URL = `${GEM_BASE}/advance-search`;
const BIDS_URL = `${GEM_BASE}/search-bids`;
const PER_PAGE = 10;
const MAX_PAGES = 200;      // safety cap per state (~2 000 records)
const NAV_TIMEOUT = 90_000;  // ms — page navigation
const BETWEEN_MS = 1_200;   // polite inter-page delay (ms)
const BETWEEN_STATES_MS = 1_500; // polite delay between states (ms)

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
    console.log('[gem-browser] loading advance-search page...');
    await page.goto(SEARCH_URL, {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT,
    });
    console.log('[gem-browser] page loaded (title:', await page.title() + ')');

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

    if (!csrf) throw new Error('[gem-browser] could not extract CSRF token');
    console.log(`[gem-browser] CSRF token acquired: ${csrf.substring(0, 8)}...`);

    // ── Step 3: Click Location Tab to reveal state dropdown (once) ───────
    console.log('[gem-browser] clicking "Search by Consignee Location" tab...');
    await page.locator('a', { hasText: 'Search by Consignee Location' }).click();

    console.log('[gem-browser] clicking state dropdown to load options...');
    const stateDropdown = page.locator('#state_name_con');
    await stateDropdown.waitFor({ state: 'visible', timeout: 15_000 });
    await stateDropdown.click();

    // Wait until at least one option other than "--Select--" appears
    await page.waitForFunction(
      () => document.querySelector('#state_name_con')?.options?.length > 1,
      { timeout: 20_000 },
    );

    // ── Step 4: Loop through every state, one selector click at a time ─────
    // Each iteration re-selects the dropdown option for that state and
    // re-submits the Location form — results are tagged with fetchedState
    // so the pipeline saves each state's records/PDFs into their own folder
    // (documents/GEM/<STATE>/, see pipeline/pdf.js).
    const allResults = [];

    for (let si = 0; si < GEM_STATES.length; si++) {
      const stateName = GEM_STATES[si];
      console.log(`[gem-browser] ─── State ${si + 1}/${GEM_STATES.length}: ${stateName} ───`);
      try {
        const stateResults = await scrapeState(page, csrf, stateName);
        console.log(`[gem-browser] [${stateName}] complete — ${stateResults.length} records`);
        allResults.push(...stateResults);
      } catch (e) {
        console.error(`[gem-browser] [${stateName}] failed:`, e.message);
      }

      if (si < GEM_STATES.length - 1) await delay(BETWEEN_STATES_MS);
    }

    console.log(`[gem-browser] ALL STATES DONE — ${allResults.length} total records`);
    return allResults;

  } finally {
    if (browser) await browser.close().catch(() => { });
  }
}

// ─── per-state scrape (selector + pagination) ────────────────────────────────

async function scrapeState(page, csrf, stateName) {
  // ── Find the option matching this state in the already-loaded dropdown ──
  const stateOption = await page.evaluate((name) => {
    const sel = document.getElementById('state_name_con');
    const rx = new RegExp(`^${name}$`, 'i');
    for (const opt of sel.options) {
      if (rx.test(opt.text.trim()) || rx.test(opt.value.trim())) {
        return { val: opt.value, text: opt.text };
      }
    }
    return { notFound: true, all: [...sel.options].map((o) => o.text) };
  }, stateName);

  if (stateOption.notFound) {
    throw new Error(`"${stateName}" not in state dropdown. Options: ${stateOption.all?.join(', ')}`);
  }

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
  console.log(`[gem-browser] [${stateName}] search submitted — waiting for /search-bids response...`);

  // ── Capture page-1 results from the form submit ─────────────────────────
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

  // ── Paginate (pages 2-N) using session-scoped fetch ─────────────────────
  // After the form submit above, the server session is scoped to this state.
  // We send page_no + csrf + state_name_con — belt-and-braces against session drift.
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
              page: pageNo
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

  return results;
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

/** "UTTAR PRADESH" -> "Uttar Pradesh" */
function titleCase(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
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
  const stateTitleCase = fetchedState ? titleCase(fetchedState) : null;

  return {
    bidNumber,
    title: title.length > 300 ? title.substring(0, 297) + '...' : title,
    department: department || ministry || null,
    organization: ministry || null,
    category,
    quantity: arr(doc.b_total_quantity) != null ? String(arr(doc.b_total_quantity)) : null,
    startDate: startDate ? new Date(startDate).toISOString() : null,
    endDate: endDate ? new Date(endDate).toISOString() : null,
    locationText: stateTitleCase,
    fetchedState: stateTitleCase, // e.g. "Chhattisgarh" — pipeline/pdf.js buckets PDFs by this into documents/GEM/<STATE>/
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
