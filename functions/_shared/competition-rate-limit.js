
const WINDOW_SECONDS = 3600;
const MAX_REQUESTS = 5;

async function hashIp(secret, ip) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      `${secret}:competition-rate-limit:${ip}`
    )
  );

  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function enforceCompetitionRateLimit(request, env) {
  if (!env.REGISTRATIONS || !env.VERIFICATION_SECRET) {
    throw new Error('Competition rate-limit configuration is missing.');
  }

  const ip = request.headers.get('CF-Connecting-IP');

  if (!ip || ip.length > 100) {
    throw new Error('Unable to establish the request IP address.');
  }

  const now = Math.floor(Date.now() / 1000);
  const ipHash = await hashIp(env.VERIFICATION_SECRET, ip);

  // Remove expired rate-limit records.
  await env.REGISTRATIONS.prepare(`
    DELETE FROM registration_rate_limits
    WHERE created_at <= ?
  `).bind(now - WINDOW_SECONDS).run();

  // Check and reserve an attempt in one SQL statement.
  const result = await env.REGISTRATIONS.prepare(`
    INSERT INTO registration_rate_limits (ip_hash, created_at)
    SELECT ?, ?
    WHERE (
      SELECT COUNT(*)
      FROM registration_rate_limits
      WHERE ip_hash = ?
        AND created_at > ?
    ) < ?
  `).bind(
    ipHash,
    now,
    ipHash,
    now - WINDOW_SECONDS,
    MAX_REQUESTS
  ).run();

  return result.meta?.changes === 1;
}
