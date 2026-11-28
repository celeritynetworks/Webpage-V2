
import { enforceCompetitionRateLimit } from '../../_shared/competition-rate-limit.js';

const MAX_BODY_BYTES = 12 * 1024;

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

function cleanText(value, maxLength) {
  return typeof value === 'string'
    ? value.trim().slice(0, maxLength)
    : '';
}

async function readJsonBody(request) {
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
          // The request body is already being rejected.
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

async function hashCode(secret, participantId, code) {
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

async function sendVerificationEmail(env, email, name, competition, code) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [email],
      subject: `Verify your registration for ${competition}`,
      text:
        `Hello ${name},\n\n` +
        `Your verification code for ${competition} is: ${code}\n\n` +
        `This code expires in 10 minutes. If you did not request this, please ignore this email.\n\n` +
        `Celerity Networks`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172b4d">
          <h2>Email verification</h2>
          <p>Hello ${escapeHtml(name)},</p>
          <p>Use the code below to verify your competition registration:</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:18px;background:#f0f6ff;text-align:center;border-radius:8px">
            ${code}
          </div>
          <p>This code expires in <strong>10 minutes</strong>.</p>
          <p>If you did not request this, you can ignore this email.</p>
          <p>Celerity Networks</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Resend delivery failed:', response.status, errorText.slice(0, 500));
    throw new Error('Verification email could not be sent.');
  }
}

export async function onRequestPost({ request, env }) {
  if (
    !env.REGISTRATIONS ||
    !env.RESEND_API_KEY ||
    !env.RESEND_FROM_EMAIL ||
    !env.VERIFICATION_SECRET
  ) {
    return json({
      error: 'Registration service is temporarily unavailable.'
    }, 503);
  }

  if (!request.headers.get('content-type')?.includes('application/json')) {
    return json({
      error: 'Please submit a valid registration form.'
    }, 415);
  }

  const parsed = await readJsonBody(request);

  if (parsed.error === 'too_large') {
    return json({ error: 'Request is too large.' }, 413);
  }

  if (parsed.error || !parsed.body) {
    return json({ error: 'Invalid request data.' }, 400);
  }

  const body = parsed.body;

  // Honeypot: return a harmless success response without processing.
  if (cleanText(body.website, 200)) {
    return json({ ok: true, message: 'Registration received.' });
  }

  const slug = cleanText(body.slug, 120);
  const fullName = cleanText(body.full_name, 120);
  const email = cleanText(body.email, 254).toLowerCase();
  const phone = cleanText(body.phone, 30);
  const organization = cleanText(body.organization, 160) || null;

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return json({
      error: 'Please select a valid competition.'
    }, 400);
  }

  if (fullName.length < 2) {
    return json({ error: 'Please enter your full name.' }, 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Please enter a valid email address.' }, 400);
  }

  if (phone.length < 7 || !/[0-9]/.test(phone)) {
    return json({ error: 'Please enter a valid phone number.' }, 400);
  }

  try {
    // Apply the shared IP-based competition rate limit.
    const allowed = await enforceCompetitionRateLimit(request, env);

    if (!allowed) {
      return json({
        error: 'Too many registration requests. Please try again later.'
      }, 429);
    }

    const competition = await env.REGISTRATIONS.prepare(`
      SELECT id, title, status, starts_at, ends_at, registration_opens_at, registration_closes_at
      FROM competitions
      WHERE slug = ?
      LIMIT 1
    `).bind(slug).first();

    if (!competition || !['upcoming', 'active'].includes(competition.status)) {
      return json({
        error: 'This competition is not open for registration.'
      }, 404);
    }

    const now = Math.floor(Date.now() / 1000);

    if (
      competition.registration_opens_at != null &&
      now < competition.registration_opens_at
    ) {
      return json({
        error: 'Registration has not opened yet.'
      }, 403);
    }

    if (competition.ends_at != null && now > competition.ends_at) {
      return json({ error: 'Registration for this competition has closed.' }, 403);
    }

    if (
      competition.registration_closes_at != null &&
      now > competition.registration_closes_at
    ) {
      return json({
        error: 'Registration for this competition has closed.'
      }, 403);
    }

    let participant = await env.REGISTRATIONS.prepare(`
      SELECT id, verified_at
      FROM competition_participants
      WHERE competition_id = ?
        AND email = ? COLLATE NOCASE
      LIMIT 1
    `).bind(competition.id, email).first();

    if (participant?.verified_at) {
      return json({
        error: 'This email is already verified for the competition.'
      }, 409);
    }

    if (participant) {
      const sendCount = await env.REGISTRATIONS.prepare(`
        SELECT COUNT(*) AS total
        FROM competition_email_verifications
        WHERE participant_id = ? AND created_at >= ?
      `).bind(participant.id, now - 3600).first();

      if (sendCount.total >= 5) {
        return json({
          error: 'You have reached the verification email limit. Please try again later.'
        }, 429);
      }

      const latest = await env.REGISTRATIONS.prepare(`
        SELECT last_sent_at
        FROM competition_email_verifications
        WHERE participant_id = ?
        ORDER BY last_sent_at DESC, created_at DESC
        LIMIT 1
      `).bind(participant.id).first();

      if (latest && now - latest.last_sent_at < 60) {
        return json({
          error: 'Please wait before requesting another verification code.'
        }, 429);
      }
    } else {
      const participantId = crypto.randomUUID();

      const participantInsert = await env.REGISTRATIONS.prepare(`
        INSERT INTO competition_participants (
          id, competition_id, full_name, email, phone, organization
        )
        SELECT ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1
          FROM competitions
          WHERE id = ?
            AND status IN ('upcoming', 'active')
        )
      `).bind(
        participantId,
        competition.id,
        fullName,
        email,
        phone,
        organization,
        competition.id
      ).run();

      // The status check and insert are one SQL statement. This prevents a
      // registration that raced with an administrator archiving the challenge.
      if (participantInsert.meta?.changes !== 1) {
        return json({
          error: 'This competition is no longer open for registration.'
        }, 409);
      }

      participant = {
        id: participantId,
        verified_at: null
      };
    }

    const code = String(
      crypto.getRandomValues(new Uint32Array(1))[0] % 1000000
    ).padStart(6, '0');

    const codeHash = await hashCode(
      env.VERIFICATION_SECRET,
      participant.id,
      code
    );

    const verificationId = crypto.randomUUID();

    await env.REGISTRATIONS.prepare(`
      INSERT INTO competition_email_verifications (
        id, participant_id, code_hash, expires_at, attempts, last_sent_at
      )
      VALUES (?, ?, ?, ?, 0, ?)
    `).bind(
      verificationId,
      participant.id,
      codeHash,
      now + 600,
      now
    ).run();

    try {
      await sendVerificationEmail(
        env,
        email,
        fullName,
        competition.title,
        code
      );
    } catch {
      await env.REGISTRATIONS.prepare(`
        UPDATE competition_email_verifications
        SET consumed_at = ?
        WHERE id = ?
      `).bind(now, verificationId).run();

      return json({
        error: 'We could not send your verification email. Please try again shortly.'
      }, 502);
    }

    await env.REGISTRATIONS.prepare(`
      UPDATE competition_email_verifications
      SET consumed_at = ?
      WHERE participant_id = ?
        AND id != ?
        AND consumed_at IS NULL
    `).bind(now, participant.id, verificationId).run();

    return json({
      ok: true,
      verification_required: true,
      message: 'A six-digit verification code has been sent to your email address.',
      competition: competition.title
    }, 202);

  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint failed')) {
      return json({
        error: 'This email is already registered for the competition.'
      }, 409);
    }

    console.error('Competition registration failed:', error);

    return json({
      error: 'Unable to complete registration at this time.'
    }, 503);
  }
}
