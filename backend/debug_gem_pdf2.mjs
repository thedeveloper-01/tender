// debug_gem_pdf2.mjs  — deeper inspection of GEM bid detail page
// Run with: node debug_gem_pdf2.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const GEM_BASE = 'https://bidplus.gem.gov.in';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-IN',
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const page = await ctx.newPage();

  // Get a real bid number
  console.log('Getting bid number from live search...');
  await page.goto(`${GEM_BASE}/advance-search`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const csrf = await page.evaluate(() => {
    const chash = document.getElementById('chash');
    if (chash?.value?.length > 8) return chash.value;
    for (const s of document.querySelectorAll('script')) {
      const m = s.textContent.match(/'csrf_bd_gem_nk'\s*:\s*'([a-f0-9]{16,})'/i);
      if (m) return m[1];
    }
    return null;
  });

  const json = await page.evaluate(async ({ base, csrf }) => {
    const body = new URLSearchParams({
      searchType: 'location', state_name_con: 'CHHATTISGARH',
      city_name_con: '', bidEndDateFrom: '', bidEndDateTo: '',
      page_no: '1', csrf_bd_gem_nk: csrf,
    });
    const r = await fetch(`${base}/search-bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: body.toString(),
    });
    return r.json();
  }, { base: GEM_BASE, csrf });

  const docs = json?.response?.response?.docs ?? [];
  const bidNumber = Array.isArray(docs[0].b_bid_number) ? docs[0].b_bid_number[0] : docs[0].b_bid_number;
  const bidLink   = `${GEM_BASE}/showbidDocument/${encodeURIComponent(bidNumber)}`;
  console.log('Bid number:', bidNumber);
  console.log('Loading detail page in browser...');

  // Load detail page inside browser (cookies + real browser headers)
  const response = await page.goto(bidLink, { waitUntil: 'networkidle', timeout: 45000 });
  console.log('Page status:', response?.status());
  console.log('Page title:', await page.title());

  // Save full HTML for offline inspection
  const html = await page.content();
  fs.writeFileSync('gem_detail_page.html', html);
  console.log('Full HTML saved to gem_detail_page.html (' + html.length + ' chars)');

  // Find ALL links
  const allLinks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href], button, [onclick]'))
      .map(el => ({
        tag:    el.tagName,
        href:   el.getAttribute('href') || '',
        onclick: el.getAttribute('onclick') || '',
        text:   el.textContent.trim().substring(0, 80),
      }))
      .filter(el => el.href || el.onclick || el.text)
      .slice(0, 40)
  );
  console.log('\nAll interactive elements on detail page:');
  allLinks.forEach(el => console.log(`  [${el.tag}] "${el.text}" href=${el.href} onclick=${el.onclick}`));

  // Look for download-related patterns in page source
  const downloadHits = [];
  const patterns = [/download/i, /pdf/i, /document/i, /view.*bid/i, /bid.*doc/i, /\.php[^'"]{0,80}/i];
  for (const pat of patterns) {
    const matches = html.match(new RegExp(pat.source + '[^\'\"<>]{0,120}', 'gi')) || [];
    if (matches.length) downloadHits.push({ pat: pat.source, matches: matches.slice(0, 3) });
  }
  console.log('\nDownload-related patterns found:');
  if (downloadHits.length === 0) console.log('  NONE');
  downloadHits.forEach(h => {
    console.log(`  [${h.pat}]:`);
    h.matches.forEach(m => console.log('   ', m.substring(0, 150)));
  });

  // Check network requests that fired while loading the page
  const requests = [];
  page.on('request', req => {
    if (req.url().includes('gem.gov.in')) requests.push({ method: req.method(), url: req.url() });
  });
  // Reload to capture
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  console.log('\nNetwork requests to gem.gov.in while loading detail page:');
  requests.slice(0, 30).forEach(r => console.log(`  ${r.method} ${r.url}`));

  await browser.close();
  console.log('\nDone. Check gem_detail_page.html for full source.');
}

main().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
