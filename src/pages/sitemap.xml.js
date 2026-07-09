

const siteUrl = 'https://cgtenders.com';

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

const today = new Date().toISOString().slice(0, 10);

function urlEntry(path, { priority = '0.7', freq = 'daily', lastmod = today } = {}) {
  return `  <url>
    <loc>${escapeXml(siteUrl + path)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}



function buildUrlset(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;
}

export async function GET(context) {

  // ── Static pages ────────────────────────────────────────────────────────────────────
  const staticPages = [
    urlEntry('/', { priority: '1.0', freq: 'daily' }),
    urlEntry('/districts', { priority: '0.8', freq: 'daily' }),
    urlEntry('/about', { priority: '0.5', freq: 'monthly' }),
    urlEntry('/contact', { priority: '0.4', freq: 'monthly' }),
    urlEntry('/privacy', { priority: '0.3', freq: 'yearly' }),
    urlEntry('/terms', { priority: '0.3', freq: 'yearly' }),
  ];

  // ── Single sitemap (no tenders detail pages) ──────────────────────────────────────────────────
  const body = buildUrlset(staticPages);
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
