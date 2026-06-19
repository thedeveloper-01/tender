import { env } from 'cloudflare:workers';

export async function POST({ request }) {
  // Verify token
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  
  // Try to read ADMIN_TOKEN from various potential sources
  const adminToken = 
    (env && env.ADMIN_TOKEN) || 
    process.env.ADMIN_TOKEN || 
    import.meta.env.ADMIN_TOKEN;
  
  if (!token || token !== adminToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const SESSION = env?.SESSION;
  if (SESSION) {
    try {
      // List all keys with prefix "api:"
      const listed = await SESSION.list({ prefix: 'api:' });
      let deletedCount = 0;
      for (const key of listed.keys) {
        await SESSION.delete(key.name);
        deletedCount++;
      }
      return new Response(JSON.stringify({ 
        success: true, 
        message: `Cleared ${deletedCount} keys from Cloudflare KV cache` 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      console.error('[clear-cache] Error clearing KV:', e.message);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response(JSON.stringify({ 
    success: true, 
    message: 'No KV namespace (SESSION) bound to clear' 
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
