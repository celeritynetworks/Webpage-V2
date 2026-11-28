import {
  isJsonRequest,
  readJsonBody,
  hashVerificationCode
} from '../../../_shared/competition-verification.js';

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    }
  });
}

function cleanText(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength
    ? value.trim()
    : '';
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

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }

  let difference = 0;

  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return difference === 0;
}

function createSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function onRequestPost({ request, env }) {
  if (!env.REGISTRATIONS || !env.VERIFICATION_SECRET) {
    return json({
      error: 'Verification service is temporarily unavailable.'
    }, 503);
  }

  if (!isJsonRequest(request)) {
    return json({
      error: 'Please submit a valid verification form.'
    }, 415);
  }

  const parsed = await readJsonBody(request);

  if (parsed.error === 'too_large') {
    return json({ error: 'Request body is too large.' }, 413);
  }

  if (parsed.error || !parsed.body) {
    return json({ error: 'Invalid request data.' }, 400);
  }

  const body = parsed.body;
  const slug = cleanText(body.slug, 120);
  const email = cleanText(body.email, 254).toLowerCase();
  const code = typeof body.code === 'string' ? body.code.trim() : '';

  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !/^\d{6}$/.test(code)
  ) {
    return json({
      error: 'Please enter a valid email address and six-digit code.'
    }, 400);
  }

  try {
    const participant = await env.REGISTRATIONS.prepare(`
      SELECT p.id, p.verified_at
      FROM competition_participants p
      INNER JOIN competitions c ON c.id = p.competition_id
      WHERE c.slug = ?
        AND p.email = ? COLLATE NOCASE
        AND p.status = 'registered'
      LIMIT 1
    `).bind(slug, email).first();

    if (!participant) {
      return json({
        error: 'The verification details are invalid or expired.'
      }, 400);
    }

    if (participant.verified_at) {
      return json({
        error: 'This email has already been verified. Please sign in.'
      }, 409);
    }

    const verification = await env.REGISTRATIONS.prepare(`
      SELECT id, code_hash, expires_at, attempts
      FROM competition_email_verifications
      WHERE participant_id = ?
        AND consumed_at IS NULL
      ORDER BY last_sent_at DESC, created_at DESC
      LIMIT 1
    `).bind(participant.id).first();

    if (!verification || verification.attempts >= 5) {
      return json({
        error: 'This verification code is unavailable. Please request a new code.'
      }, 400);
    }

    const now = Math.floor(Date.now() / 1000);

    if (now > verification.expires_at) {
      return json({
        error: 'This verification code has expired. Please request a new code.'
      }, 400);
    }

    const submittedHash = await hashVerificationCode(
      env.VERIFICATION_SECRET,
      participant.id,
      code
    );

    if (!constantTimeEqual(submittedHash, verification.code_hash)) {
      await env.REGISTRATIONS.prepare(`
        UPDATE competition_email_verifications
        SET attempts = attempts + 1
        WHERE id = ?
          AND consumed_at IS NULL
          AND attempts < 5
          AND expires_at >= ?
          AND EXISTS (
            SELECT 1
            FROM competition_participants p
            WHERE p.id = ?
              AND p.status = 'registered'
              AND p.verified_at IS NULL
          )
      `).bind(verification.id, now, participant.id).run();

      return json({
        error: 'Incorrect verification code. Please check and try again.'
      }, 400);
    }

    const token = createSessionToken();
    const sessionHash = await hashSession(token);
    const sessionId = crypto.randomUUID();
    const sessionExpiry = now + (7 * 24 * 60 * 60);

    const results = await env.REGISTRATIONS.batch([
      env.REGISTRATIONS.prepare(`
        INSERT INTO competition_participant_sessions (
          id, participant_id, session_hash, expires_at
        )
        SELECT ?, p.id, ?, ?
        FROM competition_participants p
        INNER JOIN competition_email_verifications v
          ON v.participant_id = p.id
        WHERE p.id = ?
          AND p.status = 'registered'
          AND p.verified_at IS NULL
          AND v.id = ?
          AND v.consumed_at IS NULL
          AND v.attempts < 5
          AND v.expires_at >= ?
      `).bind(
        sessionId,
        sessionHash,
        sessionExpiry,
        participant.id,
        verification.id,
        now
      ),

      env.REGISTRATIONS.prepare(`
        UPDATE competition_email_verifications
        SET consumed_at = ?
        WHERE id = ?
          AND consumed_at IS NULL
          AND attempts < 5
          AND expires_at >= ?
          AND EXISTS (
            SELECT 1
            FROM competition_participants p
            WHERE p.id = ?
              AND p.status = 'registered'
              AND p.verified_at IS NULL
          )
          AND EXISTS (
            SELECT 1
            FROM competition_participant_sessions s
            WHERE s.id = ?
              AND s.participant_id = ?
          )
      `).bind(
        now,
        verification.id,
        now,
        participant.id,
        sessionId,
        participant.id
      ),

      env.REGISTRATIONS.prepare(`
        UPDATE competition_participants
        SET verified_at = ?
        WHERE id = ?
          AND status = 'registered'
          AND verified_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM competition_email_verifications
            WHERE id = ?
              AND consumed_at = ?
          )
          AND EXISTS (
            SELECT 1
            FROM competition_participant_sessions
            WHERE id = ?
              AND participant_id = ?
          )
      `).bind(
        now,
        participant.id,
        verification.id,
        now,
        sessionId,
        participant.id
      )
    ]);

    const allSucceeded = results.length === 3 &&
      results.every(result => result.meta?.changes === 1);

    if (!allSucceeded) {
      await env.REGISTRATIONS.prepare(`
        DELETE FROM competition_participant_sessions
        WHERE id = ?
          AND participant_id = ?
      `).bind(sessionId, participant.id).run();

      return json({
        error: 'This verification code is no longer valid. Please request a new code.'
      }, 400);
    }

    const secure = new URL(request.url).protocol === 'https:'
      ? '; Secure'
      : '';

    const cookie = [
      `celerity_participant_session=${token}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${7 * 24 * 60 * 60}`
    ].join('; ') + secure;

    return json({
      ok: true,
      verified: true,
      message: 'Your email has been verified successfully.'
    }, 200, {
      'Set-Cookie': cookie
    });

  } catch (error) {
    console.error('Competition email verification failed:', error);

    return json({
      error: 'Unable to verify your email at this time.'
    }, 503);
  }
}