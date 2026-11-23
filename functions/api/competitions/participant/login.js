import { enforceCompetitionRateLimit } from '../../../_shared/competition-rate-limit.js';

import {
  isJsonRequest,
  readJsonBody,
  generateVerificationCode,
  hashVerificationCode,
  createPendingVerification,
  activatePendingVerification
} from '../../../_shared/competition-verification.js';

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
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
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

async function sendLoginEmail(env, email, name, competition, code) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [email],
      subject: 'Your Celerity Networks sign-in code',
      text:
        `Hello ${name},\n\n` +
        `Your sign-in code for ${competition} is: ${code}\n\n` +
        `This code expires in 10 minutes. If you did not request this code, you can ignore this email.\n\n` +
        `Celerity Networks`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172b4d">
          <h2>Sign in to your participant account</h2>
          <p>Hello ${escapeHtml(name)},</p>
          <p>Use this code to sign in to your Celerity Networks competition account for <strong>${escapeHtml(competition)}</strong>:</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:18px;background:#f0f6ff;text-align:center;border-radius:8px">
            ${code}
          </div>
          <p>This code expires in <strong>10 minutes</strong>.</p>
          <p>If you did not request this code, you can ignore this email.</p>
          <p>Celerity Networks</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      'Resend login email failed:',
      response.status,
      errorText.slice(0, 500)
    );
    throw new Error('Email delivery failed.');
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
      error: 'Sign-in service is temporarily unavailable.'
    }, 503);
  }

  if (!isJsonRequest(request)) {
    return json({
      error: 'Please submit a valid sign-in form.'
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
  const slug = cleanText(body.slug, 120);
  const email = cleanText(body.email, 254).toLowerCase();

  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return json({
      error: 'Please enter a valid competition and email address.'
    }, 400);
  }

  const genericResponse = {
    ok: true,
    message: 'If a verified participant account exists for these details, a sign-in code will be sent to the registered email address.'
  };

  try {
    const allowed = await enforceCompetitionRateLimit(request, env);

    if (!allowed) {
      return json(genericResponse);
    }

    const participant = await env.REGISTRATIONS.prepare(`
      SELECT p.id, p.full_name, p.verified_at, p.status, c.title
      FROM competition_participants p
      INNER JOIN competitions c ON c.id = p.competition_id
      WHERE c.slug = ?
        AND p.email = ? COLLATE NOCASE
        AND p.status = 'registered'
      LIMIT 1
    `).bind(slug, email).first();

    if (!participant || !participant.verified_at) {
      return json(genericResponse);
    }

    const pendingAt = Math.floor(Date.now() / 1000);
    const code = generateVerificationCode();

    const codeHash = await hashVerificationCode(
      env.VERIFICATION_SECRET,
      participant.id,
      code
    );

    const verificationId = crypto.randomUUID();

    const created = await createPendingVerification(env, {
      id: verificationId,
      participantId: participant.id,
      codeHash,
      now: pendingAt,
      mode: 'login'
    });

    if (!created) {
      return json(genericResponse);
    }

    try {
      await sendLoginEmail(
        env,
        email,
        participant.full_name,
        participant.title,
        code
      );
    } catch (error) {
      console.error('Login verification email delivery failed:', error);
      return json(genericResponse);
    }

    const activated = await activatePendingVerification(env, {
      id: verificationId,
      participantId: participant.id,
      pendingAt,
      now: Math.floor(Date.now() / 1000),
      mode: 'login'
    });

    if (!activated) {
      console.error(
        'Login email was delivered but code activation failed.',
        { participantId: participant.id, verificationId }
      );

      return json(genericResponse);
    }

    return json(genericResponse);

  } catch (error) {
    console.error('Participant login code request failed:', error);

    return json({
      error: 'Unable to process your sign-in request at this time.'
    }, 503);
  }
}
