/**
 * fetchers/gem_browser.js  (v5 — click-to-load dropdown + session-scoped pagination)
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
 *   3. Wait for Chhattisgarh option to appear, then select it.
 *   4. Click .btn-search — this POSTs to /search-bids with state scoped in session.
 *   5. Capture the page-1 response from that POST (intercepted via Playwright).
 *   6. Pages 2-N: send only page_no + csrf — session holds the CG filter.
 *
 * OUTPUT: Same raw record shape as gem.js#normalizeDoc() — pipeline unchanged.
 */

console.log('[gem-browser] v5 — click-dropdown + session-scoped, state=CHHATTISGARH');

import { chromium } from 'playwright';

// ─── constants ───────────────────────────────────────────────────────────────

const GEM_BASE = 'https://bidplus.gem.gov.in';
const SEARCH_URL = `${GEM_BASE}/advance-search`;
const BIDS_URL = `${GEM_BASE}/search-bids`;
const PER_PAGE = 10;
const MAX_PAGES = 200;      // safety cap (~2 000 records)
const NAV_TIMEOUT = 90_000;  // ms — page navigation
const BETWEEN_MS = 1_200;   // polite inter-page delay (ms)

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

    // ── Step 3: Click Location Tab to reveal state dropdown ──────────────
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

    // ── Step 4: Verify Chhattisgarh is in the list ─────────────────────────
    const cgOption = await page.evaluate(() => {
      const sel = document.getElementById('state_name_con');
      for (const opt of sel.options) {
        if (/chhattisgarh/i.test(opt.text)) return { val: opt.value, text: opt.text };
      }
      // Also log all options for debug if not found
      return { notFound: true, all: [...sel.options].map(o => o.text) };
    });

    if (cgOption.notFound) {
      throw new Error(`[gem-browser] Chhattisgarh not in state dropdown. Options: ${cgOption.all?.join(', ')}`);
    }
    console.log(`[gem-browser] found CG option: value="${cgOption.val}" text="${cgOption.text}"`);

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
    }, cgOption.val);

    // Click the specific search button for the Location form
    await page.locator('form#location-search a.advance-btn').first().click();
    console.log('[gem-browser] search button clicked — waiting for /search-bids response...');

    // ── Step 6: Capture page-1 results from the form submit ────────────────
    const results = [];
    let totalFound = null;
    let startPageNo = 2; // default: page 1 already handled by form submit

    let firstJson = null;
    try {
      const firstResp = await searchBidsResponsePromise;
      firstJson = await firstResp.json().catch(() => null);
    } catch (e) {
      console.warn('[gem-browser] could not intercept form-submit response:', e.message);
    }

    if (firstJson?.response?.response) {
      const solr = firstJson.response.response;
      totalFound = solr.numFound ?? 0;
      console.log(`[gem-browser] totalFound = ${totalFound}`);

      if (totalFound > 5000) {
        console.warn(
          `[gem-browser] WARNING: totalFound=${totalFound} looks like all-India — ` +
          'state filter may not have applied. Proceeding with MAX_PAGES cap.',
        );
      }

      const docs = solr.docs ?? [];
      for (const doc of docs) {
        const rec = normalizeDoc(doc);
        if (rec) results.push(rec);
      }
      console.log(`[gem-browser] page 1 (form submit): +${docs.length} → total ${results.length}/${totalFound}`);

      if (docs.length === 0 || docs.length < PER_PAGE) {
        console.log('[gem-browser] single-page result — done');
        return results;
      }
    } else {
      // Fallback: no intercepted response — start pagination from page 1
      console.warn('[gem-browser] no intercepted response from form submit — starting from page 1');
      startPageNo = 1;
    }

    // ── Step 7: Paginate (pages 2-N) using session-scoped fetch ────────────
    // After the form submit above, the server session is scoped to CG.
    // We only need to send page_no + csrf — the session holds the filter.
    for (let pageNo = startPageNo; pageNo <= MAX_PAGES; pageNo++) {
      console.log(`[gem-browser] fetching page ${pageNo}...`);

      let json;
      try {
        json = await page.evaluate(
          async ({ bidsUrl, pageNo, csrf }) => {
            try {
              const payloadStr = JSON.stringify({
                searchType: 'con',
                state_name_con: 'CHHATTISGARH',
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
          { bidsUrl: BIDS_URL, pageNo, csrf },
        );
      } catch (evalErr) {
        console.warn(`[gem-browser] evaluate error on page ${pageNo}:`, evalErr.message);
        break;
      }

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
        const snippet = JSON.stringify(json)?.substring(0, 300) ?? '(null)';
        console.warn(`[gem-browser] unexpected response on page ${pageNo}:`, snippet);
        break;
      }

      if (totalFound === null) {
        totalFound = solr.numFound ?? 0;
        console.log(`[gem-browser] totalFound = ${totalFound}`);
        if (totalFound > 5000) {
          console.warn(`[gem-browser] WARNING: totalFound=${totalFound} looks like all-India`);
        }
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

      if (results.length >= Math.min(totalFound ?? Infinity, MAX_PAGES * PER_PAGE)) break;
      if (docs.length < PER_PAGE) break; // last partial page

      await delay(BETWEEN_MS);
    }

    console.log(`[gem-browser] done — ${results.length} total records`);
    return results;

  } finally {
    if (browser) await browser.close().catch(() => { });
  }
}

// ─── normalisation ────────────────────────────────────────────────────────────

function arr(v) {
  return Array.isArray(v) ? v[0] : v;
}

function normalizeDoc(doc) {
  const bidNumber = arr(doc.b_bid_number);
  if (!bidNumber) return null;

  const title = arr(doc.bd_category_name) || arr(doc.b_category_name) || bidNumber;
  const startDate = arr(doc.final_start_date_sort) ?? null;
  const endDate = arr(doc.final_end_date_sort) ?? null;
  const status = arr(doc.b_status);
  const ministry = arr(doc.ba_official_details_minName) ?? null;
  const department = arr(doc.ba_official_details_deptName) ?? null;
  const bidType = arr(doc.b_bid_type);

  return {
    bidNumber,
    title: title.length > 300 ? title.substring(0, 297) + '...' : title,
    department: department || ministry || null,
    organization: ministry || null,
    category: arr(doc.b_cat_id) ?? 'General',
    quantity: arr(doc.b_total_quantity) != null ? String(arr(doc.b_total_quantity)) : null,
    startDate: startDate ? new Date(startDate).toISOString() : null,
    endDate: endDate ? new Date(endDate).toISOString() : null,
    locationText: 'Chhattisgarh',
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
