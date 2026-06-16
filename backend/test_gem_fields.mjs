import { chromium } from 'playwright';
async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://bidplus.gem.gov.in/advance-search', { waitUntil: 'domcontentloaded' });
  const locForm = await page.evaluate(() => {
    const form = document.querySelector('form#location-search');
    if (!form) return 'no form';
    return Array.from(form.elements).map(e => ({ name: e.name, value: e.value, type: e.type }));
  });
  console.log('Location form fields:', locForm);
  await browser.close();
}
run();
