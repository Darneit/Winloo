const SUPABASE_ORIGIN = 'https://kljfranzhcbicqlmdzci.supabase.co';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RESEND_API_URL = 'https://api.resend.com/emails';
const NOTIFICATION_EMAIL = 'zenarcto@gmail.com';
const NOTIFICATION_FROM = 'Winloo Website <notifications@winloogroup.com>';

function allowedPath(pathname) {
  return pathname.startsWith('/auth/v1/')
    || pathname.startsWith('/rest/v1/')
    || pathname.startsWith('/storage/v1/')
    || pathname.startsWith('/functions/v1/');
}

function field(form, name) {
  const value = form?.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

async function sendSubmissionNotification(env, upstreamPath, form) {
  if (!env.RESEND_API_KEY || !form) return;

  const isApplication = upstreamPath === '/functions/v1/submit-application';
  const data = isApplication
    ? {
        subject: `New Winloo application — ${field(form, 'full_name') || 'Applicant'}`,
        title: 'New career application',
        rows: [
          ['Applicant', field(form, 'full_name')],
          ['Email', field(form, 'email')],
          ['Phone', field(form, 'phone')],
          ['Position', field(form, 'position')],
          ['Current location', field(form, 'current_location')],
          ['Experience', field(form, 'years_experience') ? field(form, 'years_experience') + ' years' : '—'],
          ['Message', field(form, 'message') || '—'],
        ],
      }
    : {
        subject: `New Winloo enquiry — ${field(form, 'project_name') || field(form, 'contact_person') || 'Project'}`,
        title: 'New project enquiry',
        rows: [
          ['Contact', field(form, 'contact_person')],
          ['Company', field(form, 'company') || '—'],
          ['Email', field(form, 'email')],
          ['Phone', field(form, 'phone')],
          ['Project', field(form, 'project_name')],
          ['Location', field(form, 'project_location')],
          ['Service', field(form, 'required_service')],
          ['Project stage', field(form, 'project_stage') || '—'],
          ['Expected start', field(form, 'expected_start_date') || '—'],
          ['Description', field(form, 'project_description')],
        ],
      };

  const text = [
    data.title,
    '',
    ...data.rows.map(([label, value]) => `${label}: ${value || '—'}`),
    '',
    'Open Winloo Admin to review the full submission and uploaded files.',
  ].join('\n');

  const htmlRows = data.rows.map(([label, value]) =>
    `<tr><td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;vertical-align:top;width:150px">${escapeHtml(label)}</td><td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;white-space:pre-wrap">${escapeHtml(value || '—')}</td></tr>`
  ).join('');

  const html = `<!doctype html>
<html>
<body style="margin:0;background:#f4f1e9;font-family:Arial,sans-serif;color:#171b1d">
  <div style="max-width:680px;margin:32px auto;background:#fff;border:1px solid #e0ddd5">
    <div style="padding:22px 26px;background:#111719;color:#fff">
      <div style="font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#d9a514">Winloo Website</div>
      <h1 style="font-size:24px;margin:8px 0 0">${escapeHtml(data.title)}</h1>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${htmlRows}</table>
    <div style="padding:20px 26px;color:#5a6062;font-size:13px">
      Open Winloo Admin to review the full submission and uploaded files.
    </div>
  </div>
</body>
</html>`;

  const replyTo = field(form, 'email');

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: NOTIFICATION_FROM,
      to: [NOTIFICATION_EMAIL],
      reply_to: replyTo || undefined,
      subject: data.subject,
      text,
      html,
      tags: [
        { name: 'source', value: 'winloo-website' },
        { name: 'type', value: isApplication ? 'application' : 'enquiry' },
      ],
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    console.error('Resend notification failed', response.status, message);
  }
}

export default {
  async fetch(request, env, ctx) {
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

    const protectedSubmission = request.method === 'POST' && (
      upstreamPath === '/functions/v1/submit-enquiry' ||
      upstreamPath === '/functions/v1/submit-application'
    );

    let notificationForm = null;

    if (protectedSubmission) {
      const token = request.headers.get('x-turnstile-token');
      if (!token) {
        return new Response(JSON.stringify({ error: 'verification_required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const verificationBody = new FormData();
      verificationBody.set('secret', env.TURNSTILE_SECRET);
      verificationBody.set('response', token);
      const ip = request.headers.get('CF-Connecting-IP');
      if (ip) verificationBody.set('remoteip', ip);

      let verification;
      try {
        verification = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body: verificationBody });
      } catch {
        return new Response(JSON.stringify({ error: 'verification_unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const result = await verification.json().catch(() => ({}));
      if (!result.success) {
        return new Response(JSON.stringify({ error: 'verification_failed' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      try {
        notificationForm = await request.clone().formData();
      } catch {
        notificationForm = null;
      }
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

    if (protectedSubmission && upstream.ok && notificationForm) {
      ctx.waitUntil(sendSubmissionNotification(env, upstreamPath, notificationForm));
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