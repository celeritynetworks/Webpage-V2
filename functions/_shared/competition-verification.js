const MAX_BODY_BYTES = 12 * 1024;
const CODE_LIFETIME_SECONDS = 600;
const SEND_WINDOW_SECONDS = 3600;
const MAX_SENDS_PER_WINDOW = 5;
const RESEND_COOLDOWN_SECONDS = 60;

export function isJsonRequest(request) {
  const contentType = request.headers.get('content-type') || '';
  return contentType.split(';')[0].trim().toLowerCase() === 'application/json';
}

export async function readJsonBody(request) {
  const contentLength = request.headers.get('content-length');

  if (contentLength !== null) {
    const declaredLength = Number(contentLength);

    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength < 0 ||
      declaredLength > MAX_BODY_BYTES
    ) {
      return { error: 'too_large' };
    }
  }

  if (!request.body) {
    return { error: 'invalid' };
  }

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The oversized request is already being rejected.
        }

        return { error: 'too_large' };
      }

      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const body = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    );

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { error: 'invalid' };
    }

    return { body };
  } catch {
    return { error: 'invalid' };
  } finally {
    reader.releaseLock();
  }
}

export function generateVerificationCode() {
  const range = 0x100000000;
  const limit = Math.floor(range / 1000000) * 1000000;
  const random = new Uint32Array(1);

  do {
    crypto.getRandomValues(random);
  } while (random[0] >= limit);

  return String(random[0] % 1000000).padStart(6, '0');
}

export async function hashVerificationCode(secret, participantId, code) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${participantId}:${code}`)
  );

  return Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Creates an inactive verification record.
 *
 * mode:
 *   registration = participant must not yet be verified
 *   login        = participant must already be verified
 *
 * The INSERT itself enforces the participant's send limits.
 */
export async function createPendingVerification(
  env,
  {
    id,
    participantId,
    codeHash,
    now,
    mode
  }
) {
  if (!['registration', 'login'].includes(mode)) {
    throw new Error('Invalid verification mode.');
  }

  const verified = mode === 'login' ? 1 : 0;

  const result = await env.REGISTRATIONS.prepare(`
    INSERT INTO competition_email_verifications (
      id,
      participant_id,
      code_hash,
      expires_at,
      attempts,
      last_sent_at,
      consumed_at
    )
    SELECT ?, p.id, ?, ?, 0, ?, ?
    FROM competition_participants p
    WHERE p.id = ?
      AND p.status = 'registered'
      AND (
        (? = 0 AND p.verified_at IS NULL)
        OR
        (? = 1 AND p.verified_at IS NOT NULL)
      )
      AND (
        SELECT COUNT(*)
        FROM competition_email_verifications v
        WHERE v.participant_id = p.id
          AND v.created_at >= ?
      ) < ?
      AND NOT EXISTS (
        SELECT 1
        FROM competition_email_verifications v
        WHERE v.participant_id = p.id
          AND v.last_sent_at > ?
      )
  `).bind(
    id,
    codeHash,
    now + CODE_LIFETIME_SECONDS,
    now,
    now,
    participantId,
    verified,
    verified,
    now - SEND_WINDOW_SECONDS,
    MAX_SENDS_PER_WINDOW,
    now - RESEND_COOLDOWN_SECONDS
  ).run();

  return result.meta?.changes === 1;
}

/**
 * Activates a successfully emailed pending code and invalidates
 * all other active codes in the same D1 batch.
 *
 * A failed activation does not invalidate the previous active code.
 */
export async function activatePendingVerification(
  env,
  {
    id,
    participantId,
    pendingAt,
    now,
    mode
  }
) {
  if (!['registration', 'login'].includes(mode)) {
    throw new Error('Invalid verification mode.');
  }

  const verified = mode === 'login' ? 1 : 0;

  const results = await env.REGISTRATIONS.batch([
    env.REGISTRATIONS.prepare(`
      UPDATE competition_email_verifications
      SET consumed_at = NULL
      WHERE id = ?
        AND participant_id = ?
        AND consumed_at = ?
        AND expires_at >= ?
        AND EXISTS (
          SELECT 1
          FROM competition_participants p
          WHERE p.id = ?
            AND p.status = 'registered'
            AND (
              (? = 0 AND p.verified_at IS NULL)
              OR
              (? = 1 AND p.verified_at IS NOT NULL)
            )
        )
    `).bind(
      id,
      participantId,
      pendingAt,
      now,
      participantId,
      verified,
      verified
    ),

    env.REGISTRATIONS.prepare(`
      UPDATE competition_email_verifications
      SET consumed_at = ?
      WHERE participant_id = ?
        AND id != ?
        AND consumed_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM competition_email_verifications pending
          WHERE pending.id = ?
            AND pending.participant_id = ?
            AND pending.consumed_at IS NULL
        )
    `).bind(
      now,
      participantId,
      id,
      id,
      participantId
    )
  ]);

  return results.length === 2 &&
    results[0].meta?.changes === 1;
}
