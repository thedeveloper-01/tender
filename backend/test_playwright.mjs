import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('https://bidplus.gem.gov.in/advance-search', { waitUntil: 'domcontentloaded' });
  
  console.log('Clicking tab...');
  // Find the exact tab for Location
  await page.locator('a', { hasText: 'Search by Consignee Location' }).click();
  
  console.log('Clicking dropdown...');
  const stateDropdown = page.locator('#state_name_con');
  await stateDropdown.waitFor({ state: 'visible', timeout: 5000 });
  await stateDropdown.click();
  
  console.log('Selecting option...');
  await page.selectOption('#state_name_con', 'CHHATTISGARH');
  
  console.log('Clicking search...');
  const searchPromise = page.waitForResponse(r => r.url().includes('search-bids') && r.request().method() === 'POST');
  
  // We must click the correct .btn-search that corresponds to the Location tab
  // GeM probably has one for each tab. We can find the one inside the visible tab-pane.
  await page.locator('.tab-pane.active .btn-search').first().click();
  
  const resp = await searchPromise;
  const json = await resp.json();
  console.log('Search response totalFound:', json?.response?.response?.numFound);
  
  await browser.close();
})();
