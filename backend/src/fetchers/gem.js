import * as cheerio from 'cheerio';
import { config } from '../config.js';

/**
 * fetchGemTenders() -> raw record array
 *
 * In mock mode (USE_MOCK_GEM=true) returns realistic sample data.
 * In live mode calls the real GeM /search-bids JSON API with full pagination.
 *
 * API discovered via network inspection:
 *   POST https://bidplus.gem.gov.in/search-bids
 *   Payload: state_name_con=CHHATTISGARH&city_name_con=&page_no=N&csrf_bd_gem_nk=<token>
 *   Returns Solr-style JSON: { response: { response: { numFound, docs: [...] } } }
 *   10 records per page.
 */
export async function fetchGemTenders() {
  if (config.useMockGem) {
    return getMockGemTenders();
  }
  return fetchGemTendersLive();
}

// ─────────────────────────────────────────────
// Live fetcher
// ─────────────────────────────────────────────

const GEM_BASE = 'https://bidplus.gem.gov.in';
const PER_PAGE = 10;
const MAX_PAGES = 200; // safety cap (2000 records)

async function fetchGemTendersLive() {
  // Step 1 — get a session cookie + CSRF token from the advance-search page
  let cookies = '';
  let csrf = '';
  try {
    const init = await fetch(`${GEM_BASE}/advance-search`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
      signal: AbortSignal.timeout(20000),
    });
    // Collect Set-Cookie headers
    const setCookies = init.headers.getSetCookie?.() ?? [];
    cookies = setCookies.map((c) => c.split(';')[0]).join('; ');

    const html = await init.text();
    const csrfMatch = html.match(/csrf_bd_gem_nk['"]?\s*:\s*['"]([a-f0-9]+)['"]/);
    csrf = csrfMatch?.[1] ?? '';
    console.log('[gem-live] session ready, csrf:', csrf.substring(0, 8) + '...');
  } catch (e) {
    console.error('[gem-live] failed to initialise session:', e.message);
    throw e;
  }

  if (!csrf) {
    throw new Error('[gem-live] could not extract CSRF token from GeM page');
  }

  // Step 2 — paginate through all results
  const results = [];
  let totalFound = null;
  let page = 1;

  while (page <= MAX_PAGES) {
    try {
      const payload = new URLSearchParams({
        searchType: 'location',
        state_name_con: 'CHHATTISGARH',
        city_name_con: '',
        bidEndDateFrom: '',
        bidEndDateTo: '',
        page_no: String(page),
        csrf_bd_gem_nk: csrf,
      });

      const resp = await fetch(`${GEM_BASE}/search-bids`, {
        method: 'POST',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'en-IN,en;q=0.9',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Origin: GEM_BASE,
          Referer: `${GEM_BASE}/advance-search`,
          Cookie: cookies,
        },
        body: payload.toString(),
        signal: AbortSignal.timeout(25000),
      });

      if (!resp.ok) {
        console.error(`[gem-live] page ${page} -> HTTP ${resp.status}`);
        break;
      }

      const json = await resp.json();
      const solr = json?.response?.response;
      if (!solr) {
        console.error('[gem-live] unexpected response shape on page', page);
        break;
      }

      // Capture total on first page
      if (totalFound === null) {
        totalFound = solr.numFound ?? 0;
        const maxExpected = Math.min(totalFound, MAX_PAGES * PER_PAGE);
        console.log(`[gem-live] totalFound=${totalFound}, will fetch up to ${maxExpected} records`);
      }

      const docs = solr.docs ?? [];
      if (docs.length === 0) break;

      for (const doc of docs) {
        const record = normalizeDoc(doc);
        if (record) results.push(record);
      }

      console.log(`[gem-live] page ${page}: +${docs.length} → total so far: ${results.length}`);

      // Check if we've fetched everything
      if (results.length >= Math.min(totalFound, MAX_PAGES * PER_PAGE)) break;
      if (docs.length < PER_PAGE) break; // last page

      page++;
      // Polite delay between pages (500 ms)
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.error(`[gem-live] error on page ${page}:`, e.message);
      break;
    }
  }

  console.log(`[gem-live] done — fetched ${results.length} records`);
  return results;
}

// ─────────────────────────────────────────────
// Normalise a Solr doc from /search-bids into our standard shape
// ─────────────────────────────────────────────
function arr(v) {
  // Solr wraps values in arrays; unwrap to first element
  return Array.isArray(v) ? v[0] : v;
}

function normalizeDoc(doc) {
  const bidNumber = arr(doc.b_bid_number);
  if (!bidNumber) return null;

  const title =
    arr(doc.bd_category_name) || arr(doc.b_category_name) || bidNumber;

  const startDate = arr(doc.final_start_date_sort) ?? null;
  const endDate = arr(doc.final_end_date_sort) ?? null;

  // b_status: 1 = open/active, 0 = closed (approximate — use endDate for accuracy)
  const status = arr(doc.b_status);

  const ministry = arr(doc.ba_official_details_minName) ?? null;
  const department = arr(doc.ba_official_details_deptName) ?? null;

  const bidType = arr(doc.b_bid_type); // 1=Bid, 2=RA
  const typeLabel = bidType === 2 ? 'Reverse Auction' : 'Bid';

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
    bidValue: null, // not in search results; extracted from detail page
    emdAmount: null, // not in search results
    bidLink: `${GEM_BASE}/showbidDocument/${encodeURIComponent(bidNumber)}`,
    isActive: status === 1,
    bidTypeLabel: typeLabel,
    gemId: arr(doc.b_id) ?? null,
  };
}

// ─────────────────────────────────────────────
// Mock data (used when USE_MOCK_GEM=true)
// ─────────────────────────────────────────────
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
      organization: 'Ministry of Housing and Urban Affairs',
      category: 'Goods',
      quantity: '500',
      startDate: daysFromNow(-5),
      endDate: daysFromNow(10),
      locationText: 'Raipur, Chhattisgarh',
      bidValue: 4500000,
      emdAmount: 90000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/GEM%2F2026%2FB%2FMOCK0001',
      isActive: true,
      bidTypeLabel: 'Bid',
      gemId: null,
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0002',
      title: 'Annual maintenance contract for HVAC systems at district hospital',
      department: 'Health and Family Welfare Department',
      organization: 'Ministry of Health and Family Welfare',
      category: 'Services',
      quantity: '1',
      startDate: daysFromNow(-3),
      endDate: daysFromNow(6),
      locationText: 'Bilaspur, Chhattisgarh',
      bidValue: 1850000,
      emdAmount: 37000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/GEM%2F2026%2FB%2FMOCK0002',
      isActive: true,
      bidTypeLabel: 'Bid',
      gemId: null,
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0003',
      title: 'Supply of computers, printers and networking equipment for e-Governance centre',
      department: 'Electronics and Information Technology Department',
      organization: 'Ministry of Electronics and Information Technology',
      category: 'Goods',
      quantity: '120',
      startDate: daysFromNow(0),
      endDate: daysFromNow(15),
      locationText: 'Raigarh, Chhattisgarh',
      bidValue: 5600000,
      emdAmount: 112000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/GEM%2F2026%2FB%2FMOCK0003',
      isActive: true,
      bidTypeLabel: 'Bid',
      gemId: null,
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0004',
      title: 'Hiring of vehicles (SUVs) for forest department patrolling',
      department: 'Forest Department',
      organization: 'Ministry of Environment, Forest and Climate Change',
      category: 'Services',
      quantity: '10',
      startDate: daysFromNow(-2),
      endDate: daysFromNow(8),
      locationText: 'Jagdalpur, Bastar, Chhattisgarh',
      bidValue: 2400000,
      emdAmount: 48000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/GEM%2F2026%2FB%2FMOCK0004',
      isActive: true,
      bidTypeLabel: 'Bid',
      gemId: null,
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0005',
      title: 'Manpower outsourcing for housekeeping and security services at collectorate',
      department: 'General Administration Department',
      organization: 'Ministry of Home Affairs',
      category: 'Services',
      quantity: '25',
      startDate: daysFromNow(-7),
      endDate: daysFromNow(3),
      locationText: 'Korba, Chhattisgarh',
      bidValue: 3200000,
      emdAmount: 64000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/GEM%2F2026%2FB%2FMOCK0005',
      isActive: true,
      bidTypeLabel: 'Bid',
      gemId: null,
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0006',
      title: 'Supply of furniture items (chairs, tables, cabinets) for government offices',
      department: 'Public Works Department',
      organization: 'Ministry of Housing and Urban Affairs',
      category: 'Goods',
      quantity: '200',
      startDate: daysFromNow(-4),
      endDate: daysFromNow(12),
      locationText: 'Durg, Chhattisgarh',
      bidValue: 2800000,
      emdAmount: 56000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/GEM%2F2026%2FB%2FMOCK0006',
      isActive: true,
      bidTypeLabel: 'Bid',
      gemId: null,
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0007',
      title: 'Annual rate contract for office stationery and printing materials',
      department: 'Finance Department',
      organization: 'Ministry of Finance',
      category: 'Goods',
      quantity: '1',
      startDate: daysFromNow(-1),
      endDate: daysFromNow(20),
      locationText: 'Raipur, Chhattisgarh',
      bidValue: 950000,
      emdAmount: 19000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/GEM%2F2026%2FB%2FMOCK0007',
      isActive: true,
      bidTypeLabel: 'Bid',
      gemId: null,
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0008',
      title: 'Procurement of medical equipment and surgical instruments for district hospitals',
      department: 'Health and Family Welfare Department',
      organization: 'National Health Mission',
      category: 'Goods',
      quantity: '50',
      startDate: daysFromNow(-6),
      endDate: daysFromNow(9),
      locationText: 'Rajnandgaon, Chhattisgarh',
      bidValue: 7200000,
      emdAmount: 144000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/GEM%2F2026%2FB%2FMOCK0008',
      isActive: true,
      bidTypeLabel: 'Bid',
      gemId: null,
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0009',
      title: 'Construction and installation of solar rooftop panels at government buildings',
      department: 'New and Renewable Energy Department',
      organization: 'Ministry of New and Renewable Energy',
      category: 'Services',
      quantity: '1',
      startDate: daysFromNow(-10),
      endDate: daysFromNow(25),
      locationText: 'Bilaspur, Chhattisgarh',
      bidValue: 12500000,
      emdAmount: 250000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/GEM%2F2026%2FB%2FMOCK0009',
      isActive: true,
      bidTypeLabel: 'Bid',
      gemId: null,
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0010',
      title: 'Supply of water purification systems for rural panchayats',
      department: 'Panchayat and Rural Development Department',
      organization: 'Ministry of Jal Shakti',
      category: 'Goods',
      quantity: '80',
      startDate: daysFromNow(-3),
      endDate: daysFromNow(14),
      locationText: 'Bastar, Chhattisgarh',
      bidValue: 6400000,
      emdAmount: 128000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/GEM%2F2026%2FB%2FMOCK0010',
      isActive: true,
      bidTypeLabel: 'Bid',
      gemId: null,
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0011',
      title: 'IT infrastructure upgrade — servers, switches and UPS for NIC data centre',
      department: 'Electronics and Information Technology Department',
      organization: 'National Informatics Centre',
      category: 'Goods',
      quantity: '15',
      startDate: daysFromNow(-2),
      endDate: daysFromNow(18),
      locationText: 'Raipur, Chhattisgarh',
      bidValue: 9800000,
      emdAmount: 196000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/GEM%2F2026%2FB%2FMOCK0011',
      isActive: true,
      bidTypeLabel: 'Bid',
      gemId: null,
    },
    {
      bidNumber: 'GEM/2026/B/MOCK0012',
      title: 'Hiring of earth-moving and road construction machinery on monthly rate contract',
      department: 'Public Works Department',
      organization: 'Ministry of Road Transport and Highways',
      category: 'Services',
      quantity: '12',
      startDate: daysFromNow(-8),
      endDate: daysFromNow(5),
      locationText: 'Surguja, Chhattisgarh',
      bidValue: 5100000,
      emdAmount: 102000,
      bidLink: 'https://bidplus.gem.gov.in/showbidDocument/GEM%2F2026%2FB%2FMOCK0012',
      isActive: true,
      bidTypeLabel: 'Bid',
      gemId: null,
    },
  ];
}
