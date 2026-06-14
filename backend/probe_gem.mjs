import https from 'https';

function get(url) {
  return new Promise((resolve, reject) => {
    const fullUrl = url.startsWith('http') ? url : 'https://bidplus.gem.gov.in' + url;
    https.get(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://bidplus.gem.gov.in/',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(get(res.headers.location));
        return;
      }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}

function post(path, data, extraHeaders = {}) {
  const postData = typeof data === 'string' ? data : new URLSearchParams(data).toString();
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'bidplus.gem.gov.in',
      path,
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-IN,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': Buffer.byteLength(postData),
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://bidplus.gem.gov.in',
        'Referer': 'https://bidplus.gem.gov.in/advance-search',
        ...extraHeaders,
      }
    };
    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Step 1: Get the page to get a session cookie and CSRF token
const { body: html, headers: pageHeaders } = await get('https://bidplus.gem.gov.in/advance-search');
const cookies = pageHeaders['set-cookie']?.map(c => c.split(';')[0]).join('; ') || '';
const csrfMatch = html.match(/csrf_bd_gem_nk['"]?\s*:\s*['"]([a-f0-9]+)['"]/);
const csrf = csrfMatch ? csrfMatch[1] : '';
console.log('Session cookies:', cookies);
console.log('CSRF token:', csrf);

// Step 2: Get the full JS with bid search function
// Find the search function in the inline scripts
const inlineRe = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi;
let sm;
while ((sm = inlineRe.exec(html)) !== null) {
  const s = sm[1];
  if (s.includes('searchbid') || s.includes('bidCard') || s.includes('getbid') || s.includes('getBid') || s.includes('adv-search')) {
    // Find all $.ajax or $.get/post URLs
    const urlRe = /url\s*:\s*["']([^"']+)["']/g;
    let m;
    while ((m = urlRe.exec(s)) !== null) {
      console.log('Found URL in script:', m[1]);
    }
    // Look specifically for the search submit handler
    const searchIdx = s.indexOf('searchbid');
    if (searchIdx > -1) {
      console.log('\n=== SEARCH SUBMIT AREA ===');
      console.log(s.substring(Math.max(0, searchIdx - 500), searchIdx + 1000));
    }
    // Also show full script if it has getBid
    if (s.toLowerCase().includes('getbid') || s.toLowerCase().includes('adv-search')) {
      console.log('\n=== FULL SCRIPT WITH GETBID ===');
      console.log(s.substring(0, 3000));
    }
  }
}

// Step 3: Try the state-list-adv endpoint (we know this works)
console.log('\n========= state-list-adv =========');
const stateResult = await post('/state-list-adv', { csrf_bd_gem_nk: csrf }, { Cookie: cookies });
console.log('Status:', stateResult.status);
console.log('Response:', stateResult.body.substring(0, 300));

// Step 4: Try various search endpoint patterns
const endpointsToTry = [
  '/adv-search',
  '/advance-search',
  '/bid-adv-search',
  '/searchbid',
  '/getBidsByConsigneeLocation',
  '/get-bids-by-location',
  '/searchByLocation',
  '/bidSearch',
  '/bid-search',
  '/advance-search/search',
];

console.log('\n========= TRYING SEARCH ENDPOINTS =========');
for (const ep of endpointsToTry) {
  const r = await post(ep, {
    searchbid: 'Search',
    state_name_con: 'CHHATTISGARH',
    location_state: 'CHHATTISGARH',
    city_name_con: '',
    location_city: '',
    bidEndDateFrom: '',
    bidEndDateTo: '',
    page_no: '1',
    csrf_bd_gem_nk: csrf,
  }, { Cookie: cookies });
  if (r.status !== 404) {
    console.log(`${ep} -> status=${r.status}, response=${r.body.substring(0, 200)}`);
  }
}
