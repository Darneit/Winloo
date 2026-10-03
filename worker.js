const SUPABASE_ORIGIN = 'https://kljfranzhcbicqlmdzci.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsamZyYW56aGNiaWNxbG1kemNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMTI5MjksImV4cCI6MjEwNjU4ODkyOX0.Q-4RG7m8QelzCQdryNV0eYokD2pwoXv17t2U6Cl43H0';

function allowedPath(pathname) {
  return pathname.startsWith('/auth/v1/')
    || pathname.startsWith('/rest/v1/')
    || pathname.startsWith('/storage/v1/');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/supabase/')) {
      return env.ASSETS.fetch(request);
    }

    const upstreamPath = url.pathname.slice('/api/supabase'.length);
    if (!allowedPath(upstreamPath)) {
      return new Response('Not found', { status: 404 });
    }

    const target = new URL(SUPABASE_ORIGIN + upstreamPath);
    target.search = url.search;

    const headers = new Headers();
    const incomingAuth = request.headers.get('Authorization');
    const incomingContentType = request.headers.get('Content-Type');
    const incomingPrefer = request.headers.get('Prefer');
    const incomingRange = request.headers.get('Range');

    headers.set('apikey', SUPABASE_ANON_KEY);
    headers.set('Authorization', incomingAuth || `Bearer ${SUPABASE_ANON_KEY}`);
    if (incomingContentType) headers.set('Content-Type', incomingContentType);
    if (incomingPrefer) headers.set('Prefer', incomingPrefer);
    if (incomingRange) headers.set('Range', incomingRange);

    const init = {
      method: request.method,
      headers,
      redirect: 'follow',
    };

    if (!['GET', 'HEAD'].includes(request.method)) {
      init.body = request.body;
      init.duplex = 'half';
    }

    const upstream = await fetch(target, init);
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete('access-control-allow-origin');
    responseHeaders.delete('access-control-allow-credentials');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  },
};
