import { fetchCspgclTenders } from '../src/fetchers/cspgcl.js';

async function main() {
  console.log('Fetching CSPGCL tenders...');
  const tenders = await fetchCspgclTenders();
  console.log(`Fetched ${tenders.length} tenders.`);
  if (tenders.length > 0) {
    console.log('Sample tender:', JSON.stringify(tenders[0], null, 2));
  }
}

main().catch(e => console.error(e));
