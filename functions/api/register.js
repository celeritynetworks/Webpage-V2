
const ALLOWED_COURSES = new Set([
  'Data Analysis',
  'Web Development',
  'Digital Skills',
  'Cybersecurity',
  'Digital Marketing',
  'UI/UX & Graphic Design'
]);

const ALLOWED_MODES = new Set(['Virtual', 'Onsite']);

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

function clean(value, max) {
  return typeof value === 'string'
    ? value.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, max)
    : '';
}

async function sha256(value) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );

  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function onRequestPost({ request, env }) {
  // Email configuration is not required.
  if (!env.REGISTRATIONS) {
    console.error('Registration D1 binding is missing.');
    return json({
      error: 'Registration service is temporarily unavailable. Please try again later.'
    }, 503);
  }

  const origin = request.headers.get('Origin');

  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host) {
        return json({ error: 'Invalid request origin.' }, 403);
      }
    } catch {
      return json({ error: 'Invalid request origin.' }, 403);
    }
  }

  const contentType = (request.headers.get('Content-Type') || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();

  if (contentType !== 'application/json') {
    return json({
      error: 'Please submit the registration form using the website.'
    }, 415);
  }

  const contentLengthHeader = request.headers.get('Content-Length');

  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);

    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      return json({ error: 'Invalid request size.' }, 400);
    }

    if (contentLength > 12000) {
      return json({ error: 'The submitted form is too large.' }, 413);
    }
  }

  let input;

  try {
    const reader = request.body?.getReader();

    if (!reader) {
      return json({ error: 'Please check the form and try again.' }, 400);
    }

    const chunks = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > 12000) {
        try {
          await reader.cancel();
        } catch {}

        return json({ error: 'The submitted form is too large.' }, 413);
      }

      chunks.push(value);
    }

    const bodyBytes = new Uint8Array(totalBytes);
    let offset = 0;

    for (const chunk of chunks) {
      bodyBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const bodyText = new TextDecoder('utf-8', {
      fatal: true
    }).decode(bodyBytes);

    input = JSON.parse(bodyText);
  } catch {
    return json({ error: 'Please check the form and try again.' }, 400);
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return json({ error: 'Invalid form submission.' }, 400);
  }

  // Basic honeypot bot check.
  if (clean(input.website, 200)) {
    return json({ ok: true });
  }

  const fullName = clean(input.fullName, 100);
  const email = clean(input.email, 254).toLowerCase();
  const phone = clean(input.phone, 30);
  const course = clean(input.course, 80);
  const mode = clean(input.mode, 20);
  const education = clean(input.education, 160);

  if (
    fullName.length < 2 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    phone.replace(/\D/g, '').length < 7 ||
    !ALLOWED_COURSES.has(course) ||
    !ALLOWED_MODES.has(mode)
  ) {
    return json({
      error: 'Please provide a valid name, email, phone number, course and training mode.'
    }, 400);
  }

  // Rate limiting is mandatory. Never accept a registration without it.
  try {
    const salt = env.RATE_LIMIT_SALT;

    if (typeof salt !== 'string' || salt.length < 32) {
      console.error('Registration rate-limit configuration is invalid.');
      return json({
        error: 'Registration service is temporarily unavailable. Please try again later.'
      }, 503);
    }

    const ip = (request.headers.get('CF-Connecting-IP') || '').trim();

    if (!ip || ip.length > 100 || /\s/.test(ip)) {
      console.warn('Registration request has no valid client IP address.');
      return json({
        error: 'Registration service is temporarily unavailable. Please try again later.'
      }, 503);
    }

    const ipHash = await sha256(`${salt}:${ip}`);
    const now = Math.floor(Date.now() / 1000);

    // Remove expired rate-limit records.
    await env.REGISTRATIONS
      .prepare('DELETE FROM registration_rate_limits WHERE created_at < ?')
      .bind(now - 3600)
      .run();

    // Check the limit and record this attempt in one atomic SQL statement.
    const rateLimitResult = await env.REGISTRATIONS
      .prepare(`
        INSERT INTO registration_rate_limits (ip_hash, created_at)
        SELECT ?, ?
        WHERE (
          SELECT COUNT(*)
          FROM registration_rate_limits
          WHERE ip_hash = ? AND created_at > ?
        ) < 5
      `)
      .bind(ipHash, now, ipHash, now - 3600)
      .run();

    if ((rateLimitResult?.meta?.changes ?? 0) === 0) {
      return json({
        error: 'Too many attempts. Please wait and try again, or contact us on WhatsApp.'
      }, 429);
    }
  } catch (error) {
    console.error('Registration rate limiting failed:', error);
    return json({
      error: 'Registration service is temporarily unavailable. Please try again later.'
    }, 503);
  }

  const registrationId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  try {
    await env.REGISTRATIONS.prepare(`
      INSERT INTO student_registrations
        (id, full_name, email, phone, course, training_mode, education, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)
    `)
      .bind(
        registrationId,
        fullName,
        email,
        phone,
        course,
        mode,
        education || null,
        now
      )
      .run();
  } catch (error) {
    console.error('Registration database insert failed:', error);

    return json({
      error: 'We could not save your registration. Please try again later or contact us on WhatsApp.'
    }, 503);
  }

  // Success is returned only after D1 confirms the insert.
  return json({
    ok: true,
    registrationId,
    message: 'Your registration has been received successfully. Our team will contact you about schedules and next steps.'
  }, 201);
}
