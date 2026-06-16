import { fetchGemTenders } from './src/fetchers/gem.js';

async function test() {
  const data = await fetchGemTenders();
  console.log(`Found ${data.length} records`);
  if (data.length > 0) {
    console.log(data[0]);
  }
}

test().catch(console.error);
