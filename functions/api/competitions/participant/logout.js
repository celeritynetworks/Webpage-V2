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

export async function onRequestPost({ request, env }) {
  const secure = new URL(request.url).protocol === 'https:'
    ? '; Secure'
    : '';

  const clearCookie =
    'celerity_participant_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' +
    secure;

  // Do not clear the browser cookie if the database is unavailable.
  // The server-side session may still be valid and must be revocable.
  if (!env.REGISTRATIONS) {
    return json(
      { error: 'Logout service is temporarily unavailable.' },
      503
    );
  }

  const token = getSessionToken(request);

  // No usable session token means there is no session to revoke.
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return json(
      { ok: true, message: 'You have been signed out.' },
      200,
      { 'Set-Cookie': clearCookie }
    );
  }

  try {
    const sessionHash = await hashSession(token);
    const now = Math.floor(Date.now() / 1000);

    await env.REGISTRATIONS.prepare(`
      UPDATE competition_participant_sessions
      SET revoked_at = ?
      WHERE session_hash = ?
        AND revoked_at IS NULL
    `).bind(now, sessionHash).run();

    // Clear the browser cookie only after the database operation succeeds.
    return json(
      { ok: true, message: 'You have been signed out successfully.' },
      200,
      { 'Set-Cookie': clearCookie }
    );

  } catch (error) {
    console.error('Participant logout failed:', error);

    // Keep the cookie so the user can retry logout.
    return json({
      error: 'Unable to complete logout. Please try again.'
    }, 503);
  }
}
