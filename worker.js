const SUPABASE_ORIGIN = 'https://kljfranzhcbicqlmdzci.supabase.co';

function allowedPath(pathname) {
  return pathname.startsWith('/auth/v1/')
    || pathname.startsWith('/rest/v1/')
    || pathname.startsWith('/storage/v1/')
    || pathname.startsWith('/functions/v1/');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/supabase/')) {
      return env.ASSETS.fetch(request);
    }

    const upstreamPath = url.pathname.slice('/api/supabase'.length);

    if (!allowedPath(upstreamPath)) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const target = new URL(SUPABASE_ORIGIN + upstreamPath);
    target.search = url.search;

    const headers = new Headers();
    for (const name of ['apikey', 'authorization', 'content-type', 'prefer', 'range']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    const init = {
      method: request.method,
      headers,
      redirect: 'follow',
    };

    if (!['GET', 'HEAD'].includes(request.method)) {
      init.body = await request.arrayBuffer();
    }

    let upstream;
    try {
      upstream = await fetch(target, init);
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'upstream_fetch_failed',
        message: error instanceof Error ? error.message : 'Supabase request failed',
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete('access-control-allow-origin');
    responseHeaders.delete('access-control-allow-credentials');
    responseHeaders.delete('content-length');
    responseHeaders.delete('content-encoding');

    const body = await upstream.arrayBuffer();

    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  },
};
