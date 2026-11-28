function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function readTextWithLimit(request, maxBytes) {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
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

function isSameOrigin(request) {
  const origin = request.headers.get('Origin');

  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function parseHttpsUrl(value, linkedinOnly = false) {
  if (typeof value !== 'string' || value.length > 500) {
    return null;
  }

  if (!value.trim()) return '';

  try {
    const url = new URL(value.trim());

    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !url.hostname.includes('.') ||
      url.hostname === 'localhost'
    ) {
      return null;
    }

    if (
      linkedinOnly &&
      url.hostname !== 'linkedin.com' &&
      !url.hostname.endsWith('.linkedin.com')
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;

  const cleaned = value.trim();

  if (cleaned.length > maxLength) return null;

  return cleaned;
}

async function getAuthenticatedSubmission(db, sessionHash, now) {
  return db.prepare(`
    SELECT
      p.id AS participant_id,
      p.competition_id,
      proj.id AS submission_id

    FROM competition_participant_sessions s

    INNER JOIN competition_participants p
      ON p.id = s.participant_id

    INNER JOIN competition_project_submissions proj
      ON proj.participant_id = p.id
     AND proj.competition_id = p.competition_id

    WHERE s.session_hash = ?
      AND s.expires_at > ?
      AND s.revoked_at IS NULL
      AND p.verified_at IS NOT NULL
      AND p.status = 'registered'

    LIMIT 1
  `).bind(sessionHash, now).first();
}

export async function onRequestPost({ request, env }) {
  if (!env.REGISTRATIONS) {
    return json({
      error: 'The participant profile service is temporarily unavailable.'
    }, 503);
  }

  if (!isSameOrigin(request)) {
    return json({ error: 'Request origin could not be verified.' }, 403);
  }

  const fetchSite = request.headers.get('Sec-Fetch-Site');

  if (fetchSite && fetchSite !== 'same-origin') {
    return json({ error: 'Cross-site requests are not permitted.' }, 403);
  }

  const contentType = request.headers.get('Content-Type') || '';

  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return json({ error: 'Please submit valid profile data.' }, 415);
  }

  const contentLengthHeader = request.headers.get('Content-Length');

  if (contentLengthHeader !== null) {
    if (!/^\d+$/.test(contentLengthHeader)) {
      return json({ error: 'Invalid Content-Length header.' }, 400);
    }

    const contentLength = Number(contentLengthHeader);

    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength > 4096
    ) {
      return json({ error: 'The profile request is too large.' }, 413);
    }
  }

  const token = getSessionToken(request);

  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return json({
      authenticated: false,
      error: 'Please sign in to update your profile.'
    }, 401);
  }

  let rawBody;

  try {
    rawBody = await readTextWithLimit(request, 4096);
  } catch {
    return json({ error: 'Invalid profile data.' }, 400);
  }

  if (rawBody === null) {
    return json({ error: 'The profile request is too large.' }, 413);
  }

  let body;

  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid profile data.' }, 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Invalid profile data.' }, 400);
  }

  const allowedFields = new Set([
    'public_display_name',
    'public_bio',
    'portfolio_url',
    'linkedin_url',
    'public_profile_enabled'
  ]);

  if (Object.keys(body).some(key => !allowedFields.has(key))) {
    return json({ error: 'Unexpected profile fields were supplied.' }, 400);
  }

  const displayName = cleanText(body.public_display_name, 80);
  const bio = cleanText(body.public_bio, 500);
  const portfolioUrl = parseHttpsUrl(body.portfolio_url);
  const linkedinUrl = parseHttpsUrl(body.linkedin_url, true);

  if (
    displayName === null ||
    bio === null ||
    portfolioUrl === null ||
    linkedinUrl === null ||
    typeof body.public_profile_enabled !== 'boolean'
  ) {
    return json({
      error: 'Check your profile details and enter valid values.'
    }, 400);
  }

  if (body.public_profile_enabled && !displayName) {
    return json({
      error: 'Enter a public display name before enabling your public profile.'
    }, 400);
  }

  try {
    const db = env.REGISTRATIONS;
    const sessionHash = await hashSession(token);
    const now = Math.floor(Date.now() / 1000);

    const participant = await getAuthenticatedSubmission(
      db,
      sessionHash,
      now
    );

    if (!participant) {
      return json({
        authenticated: false,
        error: 'Your session is invalid or you have not submitted a project.'
      }, 401);
    }

    const enabled = body.public_profile_enabled ? 1 : 0;

    const result = await db.prepare(`
      UPDATE competition_project_submissions

      SET
        public_display_name = ?,
        public_bio = ?,
        portfolio_url = ?,
        linkedin_url = ?,
        public_profile_enabled = ?

      WHERE id = ?
        AND participant_id = ?
        AND EXISTS (
          SELECT 1
          FROM competition_participant_sessions s

          INNER JOIN competition_participants p
            ON p.id = s.participant_id

          WHERE s.session_hash = ?
            AND s.participant_id = ?
            AND s.expires_at > ?
            AND s.revoked_at IS NULL
            AND p.verified_at IS NOT NULL
            AND p.status = 'registered'
        )
    `).bind(
      displayName,
      bio,
      portfolioUrl,
      linkedinUrl,
      enabled,
      participant.submission_id,
      participant.participant_id,
      sessionHash,
      participant.participant_id,
      Math.floor(Date.now() / 1000)
    ).run();

    if (result.meta?.changes !== 1) {
      return json({
        error: 'Your session expired or your profile could not be updated. Please sign in again.'
      }, 401);
    }

    return json({
      ok: true,
      message: enabled
        ? 'Your public profile has been saved.'
        : 'Your public profile has been saved and public listing is disabled.',
      project_submission: {
        public_display_name: displayName,
        public_bio: bio,
        portfolio_url: portfolioUrl,
        linkedin_url: linkedinUrl,
        public_profile_enabled: enabled
      }
    });

  } catch (error) {
    console.error('Participant public profile update failed:', error);

    return json({
      error: 'Unable to update your public profile at this time.'
    }, 503);
  }
}