import fs from 'fs';

async function tryFetch(url) {
  console.log(`Trying to fetch: ${url}`);
  try {
    const res = await fetch(url);
    console.log(`Success! Status: ${res.status}`);
    const html = await res.text();
    console.log('HTML Length:', html.length);
    console.log('Contains "GEM/2026":', html.includes('GEM/2026'));
    console.log('Contains "CSPGCL":', html.includes('CSPGCL'));
    console.log('Contains "<article":', html.includes('<article'));
    console.log('Contains "result":', html.includes('result'));
    console.log('Contains "Skeleton":', html.includes('animate-pulse'));
    fs.writeFileSync('html_tenders.html', html, 'utf8');
    return true;
  } catch (e) {
    console.error(`Failed: ${url} - Error: ${e.message}`, e.stack);
    return false;
  }
}

async function run() {
  const success1 = await tryFetch('http://localhost:4321/tenders');
  if (success1) return;
  const success2 = await tryFetch('http://127.0.0.1:4321/tenders');
  if (success2) return;
  const success3 = await tryFetch('http://[::1]:4321/tenders');
}

run();
