import { fetchTenders } from '../../lib/api.js';

export async function GET({ request, locals }) {
  const runtime = locals.runtime;
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());

  // Sort keys for a stable cache key
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});
  const cacheKey = `api:tenders:${JSON.stringify(sortedParams)}`;

  try {
    let data;
    if (runtime?.env?.SESSION) {
      const cached = await runtime.env.SESSION.get(cacheKey);
      if (cached) {
        return new Response(cached, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      data = await fetchTenders(params);
      await runtime.env.SESSION.put(cacheKey, JSON.stringify(data), { expirationTtl: 3600 }); // 1 hour
    } else {
      data = await fetchTenders(params);
    }
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[proxy-tenders] Error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
