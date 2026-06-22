import fs from 'fs';

const html = fs.readFileSync('html_tenders.html', 'utf8');
console.log('HTML Length:', html.length);
console.log('Occurrences of "animate-pulse" (skeleton class):', (html.match(/animate-pulse/g) || []).length);
console.log('Occurrences of "<article" (tender cards):', (html.match(/<article/g) || []).length);

// Check if actual tender names are in the text
console.log('Does it contain "GEM/2026" in the HTML source?', html.includes('GEM/2026'));
console.log('Does it contain "CSPGCL" in the HTML source?', html.includes('CSPGCL'));

// Find a snippet of where the tenders are rendered
const articleIdx = html.indexOf('<article');
if (articleIdx !== -1) {
  console.log('\nFound <article> tag at index:', articleIdx);
  console.log('Snippet of rendered tender card:', html.substring(articleIdx, articleIdx + 400));
} else {
  console.log('\nNO <article> tag found in HTML!');
}

const pulseIdx = html.indexOf('animate-pulse');
if (pulseIdx !== -1) {
  console.log('\nFound animate-pulse at index:', pulseIdx);
  console.log('Snippet of skeleton markup:', html.substring(pulseIdx - 100, pulseIdx + 300));
}
