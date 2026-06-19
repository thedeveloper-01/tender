import { fetchStats } from '../../lib/api.js';

export async function GET({ locals }) {
  const runtime = locals.runtime;
  try {
    let data;
    if (runtime?.env?.SESSION) {
      const cached = await runtime.env.SESSION.get('api:stats');
      if (cached) {
        return new Response(cached, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      data = await fetchStats();
      await runtime.env.SESSION.put('api:stats', JSON.stringify(data), { expirationTtl: 3600 }); // 1 hour
    } else {
      data = await fetchStats();
    }
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[proxy-stats] Error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
