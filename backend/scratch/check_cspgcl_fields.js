import { fetchCspgclTenders } from '../src/fetchers/cspgcl.js';

async function main() {
  console.log('Fetching all active CSPGCL tenders...');
  const tenders = await fetchCspgclTenders();
  console.log(`Fetched ${tenders.length} tenders.`);

  let noCost = 0;
  let noEmd = 0;
  let bothMissing = 0;

  for (const t of tenders) {
    if (t.estimatedCost === null) noCost++;
    if (t.emd === null) noEmd++;
    if (t.estimatedCost === null && t.emd === null) bothMissing++;
  }

  console.log(`Tenders missing estimatedCost: ${noCost}`);
  console.log(`Tenders missing emd: ${noEmd}`);
  console.log(`Tenders missing both: ${bothMissing}`);
}

main().catch(e => console.error(e));
