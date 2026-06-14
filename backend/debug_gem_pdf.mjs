// debug_gem_pdf.mjs
// Tests whether GEM PDF download works for a real bid number.
// Run with: node debug_gem_pdf.mjs
import { chromium } from 'playwright';
import fs from 'fs';

// Pick a real bid number from your DB or any recent GEM listing
// We'll grab one live from page 1 of the search first
const GEM_BASE = 'https://bidplus.gem.gov.in';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  // Step 1: get a real bid number from live search
  console.log('Loading advance-search...');
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
  console.log('CSRF:', csrf?.substring(0, 8) + '...');

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
  if (!docs.length) { console.log('No docs found'); await browser.close(); return; }

  const bidNumber = Array.isArray(docs[0].b_bid_number) ? docs[0].b_bid_number[0] : docs[0].b_bid_number;
  const bidLink   = `${GEM_BASE}/showbidDocument/${encodeURIComponent(bidNumber)}`;
  console.log('\nTest bid number:', bidNumber);
  console.log('Bid link (HTML page):', bidLink);

  // Step 2: Check what showbidDocument returns directly (raw HTTP)
  console.log('\n--- RAW HTTP FETCH of bidLink ---');
  const rawResp = await fetch(bidLink, {
    headers: { 'User-Agent': 'Mozilla/5.0 CGTenders-Bot/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  console.log('Status:', rawResp.status);
  console.log('Content-Type:', rawResp.headers.get('content-type'));
  const rawText = await rawResp.text();
  console.log('Body length:', rawText.length, 'chars');
  console.log('Is PDF?', rawText.startsWith('%PDF'));
  console.log('First 300 chars:', rawText.substring(0, 300));

  // Step 3: If it's HTML, look for PDF links inside the document page
  console.log('\n--- SCANNING PAGE FOR PDF LINKS (browser) ---');
  await page.goto(bidLink, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const pdfLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    return links
      .map(a => ({ href: a.href, text: a.textContent.trim().substring(0, 60) }))
      .filter(l => l.href.match(/\.(pdf|PDF)/) || l.text.toLowerCase().includes('pdf') || l.text.toLowerCase().includes('download') || l.text.toLowerCase().includes('document'));
  });

  console.log('PDF/download links found on detail page:');
  if (pdfLinks.length === 0) {
    console.log('  NONE — GEM detail page has no direct PDF links');
    // Show all links for inspection
    const allLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .map(a => ({ href: a.href.substring(0, 120), text: a.textContent.trim().substring(0, 50) }))
        .filter(l => l.href && !l.href.startsWith('javascript') && l.text)
        .slice(0, 20)
    );
    console.log('\nAll links on detail page (first 20):');
    allLinks.forEach(l => console.log(' ', l.text, '->', l.href));
  } else {
    pdfLinks.forEach(l => console.log(' ', l.text, '->', l.href));
  }

  // Step 4: Check the page source for any downloadBid or PDF patterns
  const pageSource = await page.content();
  const downloadPatterns = [
    /downloadBid[^'"]{0,200}/gi,
    /viewBid[^'"]{0,200}/gi,
    /\.pdf[^'"]{0,50}/gi,
    /bid_doc[^'"]{0,100}/gi,
  ];
  console.log('\n--- PATTERNS IN PAGE SOURCE ---');
  for (const pat of downloadPatterns) {
    const matches = pageSource.match(pat) || [];
    if (matches.length) console.log(`Pattern ${pat.source.substring(0,20)}:`, matches.slice(0,3));
  }

  await browser.close();
  console.log('\nDone.');
}

main().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
