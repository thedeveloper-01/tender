import * as cheerio from 'cheerio';
import { config } from '../config.js';

/**
 * fetchGemTenders() -> raw record array
 *
 * In mock mode (USE_MOCK_GEM=true) returns realistic sample data.
 * In live mode scrapes bidplus.gem.gov.in with full pagination.
 */
export async function fetchGemTenders() {
  if (config.useMockGem) {
    return getMockGemTenders();
  }
  return fetchGemTendersLive();
}

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function getMockGemTenders() {
  return [
    {
      bidNumber: 'GEM/2026/B/MOCK0001',
      title: 'Supply and installation of LED street lighting fixtures for municipal roads',
      department: 'Urban Administration and Development Department',
      organization: 'Raipur Municipal Corporation',
      category: 'Goods',
      quantity: '500 Units',
      startDate: daysFromNow(-5),
      endDate: daysFromNow(10),
      locationText: 'Raipur, Chhattisgarh',
      bidValue: 4500000,
      emdAmount: 90000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/MOCK0001',
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0002',
      title: 'Annual maintenance contract for HVAC systems at district hospital',
      department: 'Health and Family Welfare Department',
      organization: 'District Hospital Bilaspur',
      category: 'Services',
      quantity: '1 Job',
      startDate: daysFromNow(-3),
      endDate: daysFromNow(6),
      locationText: 'Bilaspur, Chhattisgarh',
      bidValue: 1850000,
      emdAmount: 37000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/MOCK0002',
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0003',
      title: 'Civil construction of boundary wall and drainage at government polytechnic',
      department: 'Technical Education Department',
      organization: 'Government Polytechnic Durg',
      category: 'Works',
      quantity: '1 Job',
      startDate: daysFromNow(-1),
      endDate: daysFromNow(21),
      locationText: 'Durg, Chhattisgarh',
      bidValue: 7800000,
      emdAmount: 156000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/MOCK0003',
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0004',
      title: 'Manpower outsourcing for housekeeping and security services',
      department: 'General Administration Department',
      organization: 'Collectorate Office Korba',
      category: 'Services',
      quantity: '25 Personnel',
      startDate: daysFromNow(-7),
      endDate: daysFromNow(2),
      locationText: 'Korba, Chhattisgarh',
      bidValue: 3200000,
      emdAmount: 64000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/MOCK0004',
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0005',
      title: 'Supply of computers, printers and networking equipment for e-Governance centre',
      department: 'Electronics and Information Technology Department',
      organization: 'District e-Governance Society, Raigarh',
      category: 'Goods',
      quantity: '120 Units',
      startDate: daysFromNow(0),
      endDate: daysFromNow(15),
      locationText: 'Raigarh, Chhattisgarh',
      bidValue: 5600000,
      emdAmount: 112000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/MOCK0005',
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0006',
      title: 'Hiring of vehicles (SUVs and pickup trucks) for forest department patrolling',
      department: 'Forest Department',
      organization: 'Divisional Forest Office, Jagdalpur',
      category: 'Services',
      quantity: '10 Vehicles',
      startDate: daysFromNow(-2),
      endDate: daysFromNow(8),
      locationText: 'Jagdalpur, Bastar, Chhattisgarh',
      bidValue: 2400000,
      emdAmount: 48000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/MOCK0006',
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0007',
      title: 'Construction and electrical fitout of rural health sub-centre building',
      department: 'Health and Family Welfare Department',
      organization: 'CMHO Office, Ambikapur',
      category: 'Works',
      quantity: '1 Job',
      startDate: daysFromNow(1),
      endDate: daysFromNow(30),
      locationText: 'Ambikapur, Surguja, Chhattisgarh',
      bidValue: 12500000,
      emdAmount: 250000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/MOCK0007',
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0008',
      title: 'Supply of laboratory chemicals and consumables for agriculture testing lab',
      department: 'Agriculture Department',
      organization: 'Krishi Vigyan Kendra, Kawardha',
      category: 'Goods',
      quantity: '200 Items',
      startDate: daysFromNow(-4),
      endDate: daysFromNow(-1),
      locationText: 'Kawardha, Chhattisgarh',
      bidValue: 980000,
      emdAmount: 19600,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/MOCK0008',
    },
  ];
}

/**
 * Live fetcher — searches GeM advanced search by consignee state=CHHATTISGARH,
 * paginates through all results pages (10 per page).
 *
 * GeM renders results via AJAX POST to /BidSearch/getBidsBySearchCriteria.
 * If the AJAX endpoint fails or returns no data, falls back to scraping
 * the /all-bids?bidlocation=Chhattisgarh page HTML.
 */
async function fetchGemTendersLive() {
  const results = [];

  // Strategy 1: Try the AJAX endpoint used by the GeM SPA
  try {
    const ajaxResults = await fetchViaAjaxEndpoint();
    if (ajaxResults.length > 0) {
      console.log(`[gem-live] AJAX endpoint returned ${ajaxResults.length} records`);
      return ajaxResults;
    }
  } catch (e) {
    console.warn('[gem-live] AJAX endpoint failed, falling back to HTML scrape:', e.message);
  }

  // Strategy 2: Scrape the all-bids HTML page with Chhattisgarh location filter
  try {
    const htmlResults = await fetchViaHtmlScrape();
    console.log(`[gem-live] HTML scrape returned ${htmlResults.length} records`);
    return htmlResults;
  } catch (e) {
    console.error('[gem-live] HTML scrape also failed:', e.message);
  }

  return results;
}

/**
 * Try GeM's internal AJAX/JSON API endpoints that the SPA uses.
 * GeM uses POST requests to fetch paginated bid data.
 */
async function fetchViaAjaxEndpoint() {
  const results = [];
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-IN,en;q=0.9',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Origin': 'https://bidplus.gem.gov.in',
    'Referer': 'https://bidplus.gem.gov.in/advance-search',
    'X-Requested-With': 'XMLHttpRequest',
  };

  // Try known AJAX endpoints
  const endpoints = [
    'https://bidplus.gem.gov.in/BidSearch/getBidsByConsigneeLocation',
    'https://bidplus.gem.gov.in/bidSearch/getBidsByConsigneeLocation',
  ];

  for (const endpoint of endpoints) {
    let page = 1;
    const maxPages = 50;

    while (page <= maxPages) {
      const body = new URLSearchParams({
        location_state: 'CHHATTISGARH',
        location_city: '',
        bidStartDate: '',
        bidEndDate: '',
        page_no: String(page),
      });

      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: body.toString(),
          signal: AbortSignal.timeout(20000),
        });

        if (!resp.ok) {
          if (page === 1) break; // endpoint doesn't work, try next
          break;
        }

        const ct = resp.headers.get('content-type') || '';
        let data;
        if (ct.includes('application/json')) {
          data = await resp.json();
        } else {
          const html = await resp.text();
          // Try parsing as JSON first
          try {
            data = JSON.parse(html);
          } catch {
            // It's HTML — parse with cheerio
            const parsed = parseGemHtml(html);
            if (parsed.length === 0) break;
            results.push(...parsed);
            page++;
            await delay(800);
            continue;
          }
        }

        // Handle JSON response formats
        const bids = data?.data || data?.bids || data?.result || data?.records || [];
        if (!Array.isArray(bids) || bids.length === 0) break;

        for (const bid of bids) {
          const record = normalizeGemJsonRecord(bid);
          if (record) results.push(record);
        }

        // Check if more pages
        const total = data?.total || data?.totalCount || 0;
        const perPage = 10;
        if (results.length >= total || bids.length < perPage) break;

        page++;
        await delay(800);
      } catch (e) {
        if (page === 1) throw e; // re-throw to try next strategy
        break;
      }
    }

    if (results.length > 0) return results;
  }

  return results;
}

/**
 * Scrape the /all-bids HTML page with pagination.
 * GeM loads bid cards via JavaScript but the server-rendered fallback
 * and the paginated URL ?page_no=N&bidlocation=Chhattisgarh do work for
 * the static HTML skeleton — bid details are in <div class="bid-card"> elements.
 */
async function fetchViaHtmlScrape() {
  const results = [];
  const baseUrl = 'https://bidplus.gem.gov.in/all-bids';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-IN,en;q=0.9',
    'Referer': 'https://bidplus.gem.gov.in/advance-search',
    'Cache-Control': 'no-cache',
  };

  let page = 1;
  const maxPages = 100; // GeM has ~10 records/page, safety cap at 1000 records

  while (page <= maxPages) {
    const url = `${baseUrl}?page_no=${page}&bidlocation=Chhattisgarh`;

    try {
      const resp = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(25000),
      });

      if (!resp.ok) break;

      const html = await resp.text();
      const pageRecords = parseGemHtml(html);

      if (pageRecords.length === 0) break; // no more results
      results.push(...pageRecords);

      // Check if there's a "next" page in pagination
      const $ = cheerio.load(html);
      const hasNext = $('ul.pagination a, .pagination a').toArray()
        .some(a => $(a).text().trim().toLowerCase() === 'next' && $(a).attr('href'));

      // Also check total count text like "Showing 1-10 of 84"
      const totalText = $('*').filter((_, el) => {
        const t = $(el).text();
        return /showing\s+\d+\s*-\s*\d+\s+(records\s+)?of\s+\d+/i.test(t);
      }).first().text();

      const totalMatch = totalText.match(/of\s+(\d+)/i);
      const totalRecords = totalMatch ? parseInt(totalMatch[1], 10) : null;

      if (totalRecords && results.length >= totalRecords) break;
      if (!hasNext && !totalRecords) break;
      if (pageRecords.length < 10) break; // last page

      page++;
      await delay(1000); // polite delay
    } catch (e) {
      console.error(`[gem-live] page ${page} fetch error:`, e.message);
      break;
    }
  }

  return results;
}

/** Normalize a JSON bid record from GeM's API */
function normalizeGemJsonRecord(bid) {
  if (!bid) return null;
  const bidNumber = bid.bidNumber || bid.bid_number || bid.BidNumber || '';
  if (!bidNumber) return null;

  return {
    bidNumber,
    title: bid.name || bid.title || bid.itemName || bid.boqTitle || bidNumber,
    department: bid.department || bid.deptName || null,
    organization: bid.organizationName || bid.org || bid.ministry || null,
    category: bid.category || bid.categoryName || 'General',
    quantity: bid.quantity ? String(bid.quantity) : null,
    startDate: bid.startDate || bid.bidStartDate || null,
    endDate: bid.endDate || bid.bidEndDate || bid.closingDate || null,
    locationText: bid.consigneeLocation || bid.location || 'Chhattisgarh',
    bidValue: parseFloat(bid.bidValue || bid.estimatedValue || bid.amount || 0) || null,
    emdAmount: parseFloat(bid.emdAmount || bid.emd || 0) || null,
    bidLink: bid.bidLink || bid.link || `https://bidplus.gem.gov.in/showbidDocument/${bidNumber}`,
  };
}

/**
 * Parse GeM HTML page — handles the bid card structure:
 * Each bid is in a <div class="bid-card"> with nested spans/divs.
 * Also tries <div id="pagi_content"> table rows as fallback.
 */
function parseGemHtml(html) {
  const $ = cheerio.load(html);
  const results = [];

  // Primary: bid card divs
  const bidCards = $('.bid-card, .bidCard, [class*="bid-card"]');

  bidCards.each((_, card) => {
    const $card = $(card);
    const text = (sel) => $card.find(sel).first().text().trim().replace(/\s+/g, ' ');

    // Bid number — usually in a link with the bid number pattern
    let bidNumber = '';
    $card.find('a').each((_, a) => {
      const t = $(a).text().trim();
      if (/^GEM\/\d{4}\/[BR]\//.test(t)) {
        bidNumber = t;
        return false; // break
      }
    });

    // Also try data attributes or specific classes
    if (!bidNumber) {
      bidNumber = text('[class*="bid-no"], [class*="bidNo"], [class*="bid_no"]');
    }
    if (!bidNumber) return; // skip cards without a parseable bid number

    const title = text('[class*="title"], [class*="name"], h4, h5, .item-name') || bidNumber;
    const org = text('[class*="org"], [class*="ministry"], [class*="department"]') || '';
    const qty = text('[class*="qty"], [class*="quantity"]') || '';
    const startDate = text('[class*="start"]') || null;
    const endDate = text('[class*="end"], [class*="closing"]') || null;
    const location = text('[class*="location"], [class*="city"], [class*="state"]') || 'Chhattisgarh';

    // Bid value
    let bidValue = null;
    $card.find('[class*="value"], [class*="amount"]').each((_, el) => {
      const t = $(el).text().replace(/[₹,\s]/g, '');
      const n = parseFloat(t);
      if (!isNaN(n) && n > 0) { bidValue = n; return false; }
    });

    // Link
    let bidLink = `https://bidplus.gem.gov.in/showbidDocument/${encodeURIComponent(bidNumber)}`;
    $card.find('a').each((_, a) => {
      const href = $(a).attr('href') || '';
      if (href.includes('showbidDocument') || href.includes(bidNumber)) {
        bidLink = href.startsWith('http') ? href : `https://bidplus.gem.gov.in${href}`;
        return false;
      }
    });

    results.push({
      bidNumber,
      title,
      department: org || null,
      organization: org || null,
      category: 'General',
      quantity: qty || null,
      startDate: startDate ? parseGemDate(startDate) : null,
      endDate: endDate ? parseGemDate(endDate) : null,
      locationText: location,
      bidValue,
      emdAmount: null,
      bidLink,
    });
  });

  if (results.length > 0) return results;

  // Fallback: try table rows with bid data (older GeM page format)
  $('table tr').each((i, tr) => {
    if (i === 0) return;
    const tds = $(tr).find('td');
    if (tds.length < 4) return;

    const text = (el) => $(el).text().trim().replace(/\s+/g, ' ');
    const bidNoEl = tds.eq(0).find('a').first();
    const bidNumber = bidNoEl.text().trim() || text(tds.eq(0));
    if (!bidNumber || !/GEM\//i.test(bidNumber)) return;

    results.push({
      bidNumber,
      title: text(tds.eq(1)) || bidNumber,
      department: text(tds.eq(2)) || null,
      organization: text(tds.eq(2)) || null,
      category: 'General',
      quantity: text(tds.eq(3)) || null,
      startDate: tds.length > 4 ? parseGemDate(text(tds.eq(4))) : null,
      endDate: tds.length > 5 ? parseGemDate(text(tds.eq(5))) : null,
      locationText: 'Chhattisgarh',
      bidValue: null,
      emdAmount: null,
      bidLink: bidNoEl.attr('href')
        ? (bidNoEl.attr('href').startsWith('http') ? bidNoEl.attr('href') : `https://bidplus.gem.gov.in${bidNoEl.attr('href')}`)
        : `https://bidplus.gem.gov.in/showbidDocument/${encodeURIComponent(bidNumber)}`,
    });
  });

  return results;
}

/** Parse GeM date formats like "03 Jun 2026 4:47 PM" or "03/06/2026 04:47 PM" */
function parseGemDate(s) {
  if (!s) return null;
  const cleaned = s.replace(/\s+/g, ' ').trim();
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d.toISOString();

  // Try DD/MM/YYYY format
  const m = cleaned.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) {
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    const d2 = new Date(iso);
    if (!isNaN(d2.getTime())) return d2.toISOString();
  }

  return null;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
