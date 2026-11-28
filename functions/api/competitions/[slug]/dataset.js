function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}

function getSessionToken(request) {
  const cookies = (request.headers.get('Cookie') || '').split(';');

  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator === -1) continue;

    const name = cookie.slice(0, separator).trim();
    const value = cookie.slice(separator + 1).trim();

    if (name === 'celerity_participant_session') return value;
  }

  return null;
}

async function hashSession(token) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token)
  );

  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function safeFilename(value) {
  const filename = String(value || 'competition-dataset')
    .replace(/[\\/\r\n\0]/g, '_')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);

  return filename || 'competition-dataset';
}

function contentType(format) {
  switch (String(format || '').toLowerCase()) {
    case 'csv': return 'text/csv; charset=utf-8';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'xls': return 'application/vnd.ms-excel';
    case 'zip': return 'application/zip';
    case 'json': return 'application/json; charset=utf-8';
    case 'parquet': return 'application/octet-stream';
    default: return 'application/octet-stream';
  }
}

export async function onRequestGet({ request, env, params }) {
  if (!env.REGISTRATIONS || !env.DATASETS_BUCKET) {
    return json({ error: 'Competition dataset service is temporarily unavailable.' }, 503);
  }

  const slug = typeof params?.slug === 'string' ? params.slug.trim() : '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return json({ error: 'Invalid competition.' }, 400);
  }

  const token = getSessionToken(request);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return json({ authenticated: false, error: 'Please sign in to download this competition dataset.' }, 401);
  }

  try {
    const sessionHash = await hashSession(token);
    const now = Math.floor(Date.now() / 1000);

    // Access is scoped to the exact competition in the participant's verified
    // registration. The generic Dataset Hub download route is never used here.
    const participant = await env.REGISTRATIONS.prepare(`
      SELECT
        c.id AS competition_id,
        c.dataset_file_key,
        c.dataset_file_name,
        c.dataset_file_format
      FROM competition_participant_sessions s
      INNER JOIN competition_participants p
        ON p.id = s.participant_id
      INNER JOIN competitions c
        ON c.id = p.competition_id
      WHERE s.session_hash = ?
        AND s.expires_at > ?
        AND s.revoked_at IS NULL
        AND p.verified_at IS NOT NULL
        AND p.status = 'registered'
        AND c.slug = ?
      LIMIT 1
    `).bind(sessionHash, now, slug).first();

    if (!participant) {
      return json({
        authenticated: false,
        error: 'A verified registration for this specific competition is required.'
      }, 403);
    }

    const expectedPrefix = `competitions/${participant.competition_id}/`;
    if (
      !participant.dataset_file_key ||
      !participant.dataset_file_name ||
      !participant.dataset_file_key.startsWith(expectedPrefix) ||
      participant.dataset_file_key.includes('..')
    ) {
      return json({ error: 'The competition dataset is unavailable.' }, 404);
    }

    const object = await env.DATASETS_BUCKET.get(participant.dataset_file_key);
    if (!object?.body) {
      return json({ error: 'The competition dataset is currently unavailable.' }, 404);
    }

    const headers = new Headers({
      'Content-Type': contentType(participant.dataset_file_format),
      'Content-Disposition': `attachment; filename="${safeFilename(participant.dataset_file_name)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    });

    if (Number.isFinite(object.size) && object.size >= 0) {
      headers.set('Content-Length', String(object.size));
    }

    if (typeof object.writeHttpMetadata === 'function') {
      object.writeHttpMetadata(headers);
      // Do not let stored metadata weaken the download security headers.
      headers.set('Content-Type', contentType(participant.dataset_file_format));
      headers.set('Content-Disposition', `attachment; filename="${safeFilename(participant.dataset_file_name)}"`);
      headers.set('Cache-Control', 'private, no-store');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Referrer-Policy', 'no-referrer');
      if (Number.isFinite(object.size) && object.size >= 0) {
        headers.set('Content-Length', String(object.size));
      }
    }

    if (object.httpEtag) headers.set('ETag', object.httpEtag);

    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    console.error('Competition dataset download failed:', error);
    return json({ error: 'Unable to download this competition dataset at this time.' }, 503);
  }
}
