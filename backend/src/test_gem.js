import { config } from './config.js';

async function testPages() {
  const GEM_BASE = 'https://bidplus.gem.gov.in';
  
  // Step 1 - get session
  let cookies = '';
  let csrf = '';
  const init = await fetch(`${GEM_BASE}/advance-search`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  const rawCookie = init.headers.get('set-cookie');
  if (rawCookie) {
    cookies = rawCookie.split(/,\s*(?=[a-zA-Z0-9_\-]+[=])/).map(c => c.split(';')[0]).join('; ');
  }
  const html = await init.text();
  const csrfMatch = html.match(/csrf_bd_gem_nk['"]?\s*:\s*['"]([a-f0-9]+)['"]/);
  csrf = csrfMatch?.[1] ?? '';
  
  console.log('CSRF:', csrf);
  
  for (const page of ['1', '2', '5', '10']) {
    const p = new URLSearchParams({
      searchType: 'location',
      state_name_con: 'CHHATTISGARH',
      city_name_con: '',
      bidEndDateFrom: '',
      bidEndDateTo: '',
      page_no: page,
      csrf_bd_gem_nk: csrf,
    });
    const r = await fetch(`${GEM_BASE}/search-bids`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Cookie: cookies,
      },
      body: p.toString(),
    });
    const j = await r.json();
    const bids = (j?.response?.response?.docs || []).map(d => Array.isArray(d.b_bid_number) ? d.b_bid_number[0] : d.b_bid_number);
    console.log(`Page ${page} Bids:`, bids);
  }
}

testPages();
