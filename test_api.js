async function run() {
  const url = 'https://cgtenders-com.onrender.com/api/tenders?status=open&limit=100';
  console.log(`Fetching API: ${url}`);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    console.log('Status:', res.status);
    console.log('Response headers:', Object.fromEntries(res.headers.entries()));
    const data = await res.json();
    console.log(`Fetch completed in ${Date.now() - start}ms`);
    console.log('Tenders count:', data.tenders?.length);
    console.log('Total count:', data.total);
    if (data.tenders && data.tenders.length > 0) {
      console.log('First tender example:', {
        bidNumber: data.tenders[0].bidNumber,
        title: data.tenders[0].title,
        source: data.tenders[0].source
      });
    }
  } catch (e) {
    console.error('Error fetching API:', e.message);
  }
}

run();
