import { request } from 'undici';

try {
  const { body } = await request('https://cgtenders-com.onrender.com/api/tenders?mseStartupOnly=true');
  const data = JSON.parse(await body.text());
  
  console.log(`Live Render API returned ${data.tenders?.length} tenders.`);
  data.tenders.forEach((t, i) => {
    const ai = t.sourceMeta?.aiExtract?.eligibility;
    const pdf = t.sourceMeta?.pdfExtract?.fields;
    console.log(`[${i}]: Title=${JSON.stringify(t.title.slice(0, 40))}`);
    console.log(`     aiExtract: mse=${ai?.mseExemption}, startup=${ai?.startupExemption}`);
    console.log(`     pdfExtract: mse=${pdf?.mseExemption?.value}, startup=${pdf?.startupExemption?.value}`);
  });
} catch (e) {
  console.error('Error:', e.message);
}
