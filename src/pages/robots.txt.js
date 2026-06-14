const rawSiteUrl = import.meta.env.SITE_URL || 'https://cgtenders.com';
const siteUrl = rawSiteUrl.endsWith('/') ? rawSiteUrl.slice(0, -1) : rawSiteUrl;
export async function GET() {
  const body = `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${siteUrl}/sitemap.xml`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
}
