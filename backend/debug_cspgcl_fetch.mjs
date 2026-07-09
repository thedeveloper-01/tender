import { fetchCspgclTenders } from './src/fetchers/cspgcl.js';

console.log('[debug] Fetching all CSPGCL plants...');
const records = await fetchCspgclTenders();
console.log(`\n[debug] Total active tenders fetched: ${records.length}`);
if (records.length > 0) {
  console.log('[debug] Sample record:', JSON.stringify(records[0], null, 2));
} else {
  console.log('[debug] No records returned — check the fetcher logic.');
}
