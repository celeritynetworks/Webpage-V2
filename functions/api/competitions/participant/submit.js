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

function parseGitHubRepository(value) {
  if (typeof value !== 'string' || value.length > 300) {
    return null;
  }

  try {
    const url = new URL(value.trim());

    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    const parts = url.pathname.split('/').filter(Boolean);

    if (
      parts.length !== 2 ||
      parts.some(part => part.includes('%'))
    ) {
      return null;
    }

    const owner = parts[0];
    let repository = parts[1];

    if (/\.git$/i.test(repository)) {
      repository = repository.replace(/\.git$/i, '');
    }

    const validOwner =
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner);

    const validRepository =
      /^[A-Za-z0-9._-]{1,100}$/.test(repository) &&
      repository !== '.' &&
      repository !== '..';

    if (!validOwner || !validRepository) {
      return null;
    }

    return {
      owner,
      repository,
      url: `https://github.com/${owner}/${repository}`
    };
  } catch {
    return null;
  }
}

async function getAuthenticatedParticipant(db, sessionHash, now) {
  return db.prepare(`
    SELECT
      p.id,
      p.full_name,
      p.email,
      p.status AS participant_status,
      p.verified_at,

      c.id AS competition_id,
      c.title AS competition_title,
      c.status AS competition_status,
      c.starts_at,
      c.ends_at

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

    LIMIT 1
  `).bind(sessionHash, now).first();
}

function checkCompetitionWindow(competition, now) {
  if (
    !competition ||
    ['draft', 'completed', 'archived'].includes(competition.competition_status)
  ) {
    return {
      error: 'This competition is not accepting submissions.',
      status: 409
    };
  }

  if (now < competition.starts_at) {
    return {
      error: 'Project submissions have not opened yet.',
      status: 409
    };
  }

  if (now > competition.ends_at) {
    return {
      error: 'The submission deadline has passed.',
      status: 409
    };
  }

  return null;
}

export async function onRequestPost({ request, env }) {
  if (!env.REGISTRATIONS) {
    return json({
      error: 'The submission service is temporarily unavailable.'
    }, 503);
  }

  // Require a same-origin browser request.
  if (!isSameOrigin(request)) {
    return json({ error: 'Request origin could not be verified.' }, 403);
  }

  const fetchSite = request.headers.get('Sec-Fetch-Site');

  if (fetchSite && fetchSite !== 'same-origin') {
    return json({ error: 'Cross-site requests are not permitted.' }, 403);
  }

  const contentType = request.headers.get('Content-Type') || '';

  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return json({ error: 'Please submit a valid project submission.' }, 415);
  }

  const contentLengthHeader = request.headers.get('Content-Length');

  if (contentLengthHeader !== null) {
    if (!/^\d+$/.test(contentLengthHeader)) {
      return json({ error: 'Invalid Content-Length header.' }, 400);
    }

    const contentLength = Number(contentLengthHeader);

    if (!Number.isSafeInteger(contentLength)) {
      return json({ error: 'Invalid Content-Length header.' }, 400);
    }

    if (contentLength > 4096) {
      return json({ error: 'The submission request is too large.' }, 413);
    }
  }

  const token = getSessionToken(request);

  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return json({
      authenticated: false,
      error: 'Please sign in to submit your project.'
    }, 401);
  }

  let rawBody;

  try {
    rawBody = await readTextWithLimit(request, 4096);
  } catch {
    return json({ error: 'Invalid submission data.' }, 400);
  }

  if (rawBody === null) {
    return json({ error: 'The submission request is too large.' }, 413);
  }

  let body;

  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid submission data.' }, 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Invalid submission data.' }, 400);
  }
  const repository = parseGitHubRepository(body.repository_url);

  if (!repository) {
    return json({
      error: 'Enter a valid public GitHub repository URL.'
    }, 400);
  }
  if (
    body.ownership_confirmed !== true ||
    body.public_repository_confirmed !== true
  ) {
    return json({
      error: 'You must accept both project submission declarations.'
    }, 400);
  }

  const DECLARATION_VERSION = 'github-project-v1-2026-11-04';

  try {
    const db = env.REGISTRATIONS;
    const sessionHash = await hashSession(token);
    const now = Math.floor(Date.now() / 1000);

    // Authenticate the participant from the existing session.
    const participant = await getAuthenticatedParticipant(
      db,
      sessionHash,
      now
    );

    if (!participant) {
      return json({
        authenticated: false,
        error: 'Your session is invalid or has expired. Please sign in again.'
      }, 401);
    }

    const windowError = checkCompetitionWindow(participant, now);

    if (windowError) {
      return json({ error: windowError.error }, windowError.status);
    }

    // Reject an existing submission before contacting GitHub.
    const existing = await db.prepare(`
      SELECT id
      FROM competition_project_submissions
      WHERE competition_id = ?
        AND participant_id = ?
      LIMIT 1
    `).bind(
      participant.competition_id,
      participant.id
    ).first();

    if (existing) {
      return json({
        error: 'You have already submitted a project for this competition.'
      }, 409);
    }

    // Use the validated repository URL without contacting the GitHub API.
    const submittedUrl = repository.url;
    const submittedOwner = repository.owner;
    const submittedRepository = repository.repository;
    // Recheck authentication and deadline immediately before saving.
    const current = await getAuthenticatedParticipant(
      db,
      sessionHash,
      Math.floor(Date.now() / 1000)
    );

    if (!current || current.id !== participant.id) {
      return json({
        authenticated: false,
        error: 'Your session is no longer valid. Please sign in again.'
      }, 401);
    }

    const finalNow = Math.floor(Date.now() / 1000);
    const finalWindowError = checkCompetitionWindow(current, finalNow);

    if (finalWindowError) {
      return json({
        error: finalWindowError.error
      }, finalWindowError.status);
    }

    const submissionId = crypto.randomUUID();

    // Unique constraint prevents duplicate submissions, including race conditions.
    const result = await db.prepare(`
      INSERT INTO competition_project_submissions (
        id,
        competition_id,
        participant_id,
        participant_name,
        participant_email,
        repository_url,
        repository_owner,
        repository_name,
        status,
        submitted_at,
        ownership_confirmed,
        public_repository_confirmed,
        declaration_version,
        declarations_accepted_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1
        FROM competitions
        WHERE id = ?
          AND status IN ('upcoming', 'active')
      )
      ON CONFLICT (competition_id, participant_id) DO NOTHING
    `).bind(
      submissionId,
      current.competition_id,
      current.id,
      current.full_name,
      current.email,
      submittedUrl,
      submittedOwner,
      submittedRepository,
      finalNow,
      1,
      1,
      DECLARATION_VERSION,
      finalNow,
      current.competition_id
    ).run();

    if (result.meta?.changes !== 1) {
      return json({
        error: 'The competition may have closed or a project submission already exists for your account.'
      }, 409);
    }

    return json({
      ok: true,
      message: 'Your GitHub project has been submitted successfully.',
      project_submission: {
        id: submissionId,
        repository_url: submittedUrl,
        status: 'submitted',
        submitted_at: finalNow
      }
    }, 201);

  } catch (error) {
    console.error('Competition project submission failed:', error);

    return json({
      error: 'Unable to process your project submission at this time.'
    }, 503);
  }
}
