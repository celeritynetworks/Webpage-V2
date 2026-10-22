
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

  if (!(request.headers.get('Content-Type') || '')
    .toLowerCase().includes('application/json')) {
    return json({
      error: 'Please submit the registration form using the website.'
    }, 415);
  }

  const length = Number(request.headers.get('Content-Length') || 0);

  if (length > 12000) {
    return json({ error: 'The submitted form is too large.' }, 413);
  }

  let input;

  try {
    input = await request.json();
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

  // Rate limiting is best-effort. Its failure must not block registration.
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const salt = env.RATE_LIMIT_SALT || 'celerity-registration';
    const ipHash = await sha256(`${salt}:${ip}`);
    const now = Math.floor(Date.now() / 1000);

    await env.REGISTRATIONS
      .prepare('DELETE FROM registration_rate_limits WHERE created_at < ?')
      .bind(now - 3600)
      .run();

    const count = await env.REGISTRATIONS
      .prepare('SELECT COUNT(*) AS total FROM registration_rate_limits WHERE ip_hash = ? AND created_at > ?')
      .bind(ipHash, now - 3600)
      .first();

    if ((count?.total || 0) >= 5) {
      return json({
        error: 'Too many attempts. Please wait and try again, or contact us on WhatsApp.'
      }, 429);
    }

    await env.REGISTRATIONS
      .prepare('INSERT INTO registration_rate_limits (ip_hash, created_at) VALUES (?, ?)')
      .bind(ipHash, now)
      .run();
  } catch (error) {
    console.warn('Rate limiting unavailable; continuing registration.', error);
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
