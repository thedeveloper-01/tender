// debug_csrf.mjs — run with: node debug_csrf.mjs
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  locale: 'en-IN',
});
const page = await ctx.newPage();

console.log('Loading advance-search...');
await page.goto('https://bidplus.gem.gov.in/advance-search', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
console.log('Page title:', await page.title());

const data = await page.evaluate(() => {
  // 1. Scan all inline <script> tags for any CSRF-like token
  const scripts = Array.from(document.querySelectorAll('script'));
  const scriptHits = [];
  for (const s of scripts) {
    const text = s.textContent;
    // look for csrf or any 32-char hex string
    const idx = text.toLowerCase().indexOf('csrf');
    if (idx !== -1) {
      scriptHits.push(text.substring(Math.max(0, idx - 30), idx + 100).trim());
    }
  }

  // 2. Check window variables that contain 'csrf' in name
  const winKeys = Object.keys(window).filter((k) => k.toLowerCase().includes('csrf'));
  const winVals = {};
  for (const k of winKeys) winVals[k] = String(window[k]).substring(0, 60);

  // 3. Look for hidden inputs with csrf-related names
  const inputs = Array.from(document.querySelectorAll('input[type=hidden]')).map((i) => ({
    name: i.name,
    id: i.id,
    value: i.value.substring(0, 60),
  }));

  // 4. Also dump first 2000 chars of page HTML for inspection
  const bodySnippet = document.body.innerHTML.substring(0, 2000);

  return { scriptHits: scriptHits.slice(0, 8), winKeys, winVals, inputs, bodySnippet };
});

console.log('\n=== SCRIPT CSRF HITS ===');
data.scriptHits.forEach((h, i) => console.log(`[${i}]`, h));

console.log('\n=== WINDOW CSRF KEYS ===', data.winKeys, data.winVals);

console.log('\n=== HIDDEN INPUTS ===');
data.inputs.forEach((inp) => console.log(inp));

console.log('\n=== BODY SNIPPET (first 2000 chars) ===');
console.log(data.bodySnippet);

await browser.close();
