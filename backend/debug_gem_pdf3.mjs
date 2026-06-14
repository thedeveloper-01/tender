// debug_gem_pdf3.mjs — test multiple URL patterns for GEM bid details
// Run with: node debug_gem_pdf3.mjs
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

  // Get multiple bid numbers and try different active ones
  console.log('Loading advance-search to get fresh bid numbers...');
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
  console.log(`Got ${docs.length} docs`);

  // Try multiple bid numbers (first 3)
  for (let i = 0; i < Math.min(3, docs.length); i++) {
    const doc = docs[i];
    const bidNumber = Array.isArray(doc.b_bid_number) ? doc.b_bid_number[0] : doc.b_bid_number;
    const gemId     = Array.isArray(doc.b_id) ? doc.b_id[0] : doc.b_id;
    const status    = Array.isArray(doc.b_status) ? doc.b_status[0] : doc.b_status;
    console.log(`\n====== Bid ${i+1}: ${bidNumber} (status=${status}, gemId=${gemId}) ======`);

    // Try every known URL pattern GEM uses
    const urlsToTest = [
      `${GEM_BASE}/showbidDocument/${encodeURIComponent(bidNumber)}`,
      `${GEM_BASE}/showBidDocument/${encodeURIComponent(bidNumber)}`,
      `${GEM_BASE}/bid-details/${encodeURIComponent(bidNumber)}`,
      `${GEM_BASE}/viewbid/${encodeURIComponent(bidNumber)}`,
      gemId ? `${GEM_BASE}/showbidDocument/${gemId}` : null,
      gemId ? `${GEM_BASE}/biddocument/${gemId}` : null,
    ].filter(Boolean);

    for (const url of urlsToTest) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(8000),
          redirect: 'follow',
        });
        const ct = r.headers.get('content-type') || '';
        const isPdf = ct.includes('pdf');
        console.log(`  ${r.status} [${ct.split(';')[0]}] ${isPdf ? '✓ PDF!' : ''} → ${url}`);
      } catch (e) {
        console.log(`  ERR: ${e.message.substring(0,60)} → ${url}`);
      }
    }

    // Also try loading in the real browser
    const bidLink = `${GEM_BASE}/showbidDocument/${encodeURIComponent(bidNumber)}`;
    try {
      const resp = await page.goto(bidLink, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const status2 = resp?.status();
      console.log(`\n  Browser load status: ${status2}, title: "${await page.title()}"`);
      if (status2 === 200) {
        // Save HTML
        const html = await page.content();
        const filename = `gem_detail_${i}.html`;
        fs.writeFileSync(filename, html);
        console.log(`  Saved HTML to ${filename} (${html.length} chars)`);
        
        // Look for PDF download URLs in network requests  
        const networkUrls = [];
        page.on('response', async res => {
          const url2 = res.url();
          const ct2 = res.headers()['content-type'] || '';
          if (ct2.includes('pdf') || url2.includes('pdf') || url2.includes('document')) {
            networkUrls.push(`${res.status()} [${ct2}] ${url2}`);
          }
        });
        
        // Look for download links in DOM
        const links = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a, button'))
            .map(el => ({ tag: el.tagName, text: el.textContent.trim().substring(0,60), href: el.href || el.getAttribute('onclick') || '' }))
            .filter(el => el.text || el.href)
        );
        console.log(`  DOM elements (${links.length} total, first 20):`);
        links.slice(0, 20).forEach(l => console.log(`    [${l.tag}] "${l.text}" -> ${l.href.substring(0,100)}`));
      }
    } catch (e) {
      console.log(`  Browser load error: ${e.message.substring(0,80)}`);
    }
  }

  await browser.close();
  console.log('\nDone.');
}

main().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
