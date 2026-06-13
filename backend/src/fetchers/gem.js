import { config } from '../config.js';

/**
 * fetchGemTenders() -> raw record array
 * Shape: { bidNumber, title, department, organization, category, quantity,
 *          startDate, endDate, locationText, bidValue, emdAmount, bidLink }
 *
 * In mock mode (USE_MOCK_GEM=true, the default) this returns realistic
 * sample Chhattisgarh tenders covering a spread of cities, categories and
 * value ranges so the rest of the pipeline can be developed/tested without
 * live access to bidplus.gem.gov.in.
 *
 * The real implementation is isolated below in fetchGemTendersLive() so it
 * can be patched independently once the live endpoint/response shape has
 * been confirmed.
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
 * Live fetcher against bidplus.gem.gov.in, filtered to Chhattisgarh.
 * Kept isolated so it can be patched once the live request/response
 * shape has been confirmed against the real site.
 */
async function fetchGemTendersLive() {
  const results = [];
  const baseUrl = 'https://bidplus.gem.gov.in/all-bids';
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  let page = 1;
  const maxPages = 50; // safety cap

  while (page <= maxPages) {
    try {
      const url = `${baseUrl}?page_no=${page}&bidlocation=Chhattisgarh`;
      const resp = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-IN,en;q=0.9',
        },
        signal: AbortSignal.timeout(25000),
      });

      if (!resp.ok) break;
      const html = await resp.text();

      // TODO: parse `html` with cheerio once the live page structure is
      // confirmed. Each bid card typically contains: bid number, title,
      // department/organisation, quantity, start/end dates, location, and
      // a document link. Push normalized raw records into `results`.
      const pageRecords = parseGemHtml(html);
      if (pageRecords.length === 0) break;
      results.push(...pageRecords);

      page += 1;
      await new Promise((r) => setTimeout(r, 1000)); // be polite
    } catch (e) {
      console.error('[gem] live fetch error:', e.message);
      break;
    }
  }

  return results;
}

/** Placeholder HTML parser — to be implemented once live structure confirmed. */
function parseGemHtml(_html) {
  return [];
}
