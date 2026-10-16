const ALLOWED_COURSES = new Set([
  'Data Analysis', 'Web Development', 'Digital Skills',
  'Cybersecurity', 'Digital Marketing', 'UI/UX & Graphic Design'
]);
const ALLOWED_MODES = new Set(['Virtual', 'Onsite']);
const ADMIN_EMAIL = 'celeritynetworksltd@gmail.com';

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
  return typeof value === 'string' ? value.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, max) : '';
}
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sendEmail(env, { to, subject, html, replyTo }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) })
  });
  if (!response.ok) {
    const body = await response.text();
    console.error('Email provider returned an error', response.status, body.slice(0, 500));
    throw new Error('Email delivery failed');
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.REGISTRATIONS || !env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !env.RATE_LIMIT_SALT) {
    return json({ error: 'Registration is temporarily unavailable. Please contact us on WhatsApp.' }, 503);
  }
  const origin = request.headers.get('Origin');
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host) return json({ error: 'Invalid request origin.' }, 403);
    } catch { return json({ error: 'Invalid request origin.' }, 403); }
  }
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    return json({ error: 'Please submit the registration form using the website.' }, 415);
  }
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 12000) return json({ error: 'The submitted form is too large.' }, 413);

  let input;
  try { input = await request.json(); } catch { return json({ error: 'Please check the form and try again.' }, 400); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Invalid form submission.' }, 400);
  // Quiet honeypot for basic bot filtering. Return a generic success to avoid exposing the check.
  if (clean(input.website, 200)) return json({ ok: true });

  const fullName = clean(input.fullName, 100);
  const email = clean(input.email, 254).toLowerCase();
  const phone = clean(input.phone, 30);
  const course = clean(input.course, 80);
  const mode = clean(input.mode, 20);
  const education = clean(input.education, 160);
  // Derive pricing on the server so the submitted course details cannot set their own fee.
  const courseDuration = course === 'Data Analysis' ? '12 weeks' : '16 weeks';
  const courseFee = course === 'Data Analysis' ? '₦200,000' : '₦250,000';
  if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.replace(/\D/g, '').length < 7 || !ALLOWED_COURSES.has(course) || !ALLOWED_MODES.has(mode)) {
    return json({ error: 'Please provide a valid name, email, phone number, course and training mode.' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipHash = await sha256(`${env.RATE_LIMIT_SALT || 'celerity-registration'}:${ip}`);
  const now = Math.floor(Date.now() / 1000);
  try {
    await env.REGISTRATIONS.prepare('DELETE FROM registration_rate_limits WHERE created_at < ?').bind(now - 3600).run();
    const count = await env.REGISTRATIONS.prepare('SELECT COUNT(*) AS total FROM registration_rate_limits WHERE ip_hash = ? AND created_at > ?').bind(ipHash, now - 3600).first();
    if ((count?.total || 0) >= 5) return json({ error: 'Too many attempts. Please wait and try again, or contact us on WhatsApp.' }, 429);
    await env.REGISTRATIONS.prepare('INSERT INTO registration_rate_limits (ip_hash, created_at) VALUES (?, ?)').bind(ipHash, now).run();
  } catch (error) {
    console.error('Registration rate-limit check failed', error);
    return json({ error: 'We could not process your registration right now. Please try again later.' }, 503);
  }

  const registrationId = crypto.randomUUID();
  try {
    await env.REGISTRATIONS.prepare(`INSERT INTO student_registrations
      (id, full_name, email, phone, course, training_mode, education, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)`)
      .bind(registrationId, fullName, email, phone, course, mode, education || null, now).run();
  } catch (error) {
    console.error('Registration database insert failed', error);
    return json({ error: 'We could not save your registration. Please try again later.' }, 503);
  }

  const name = escapeHtml(fullName);
  const safeEmail = escapeHtml(email);
  const safePhone = escapeHtml(phone);
  const safeCourse = escapeHtml(course);
  const safeMode = escapeHtml(mode);
  const safeEducation = escapeHtml(education || 'Not provided');
  const adminHtml = `<h2>New student registration</h2><p><b>Reference:</b> ${registrationId}</p><p><b>Name:</b> ${name}</p><p><b>Email:</b> ${safeEmail}</p><p><b>Phone / WhatsApp:</b> ${safePhone}</p><p><b>Course:</b> ${safeCourse}</p><p><b>Duration:</b> ${courseDuration}</p><p><b>Training fee:</b> ${courseFee}</p><p><b>Training mode:</b> ${safeMode}</p><p><b>Educational background:</b> ${safeEducation}</p><p><b>Submitted:</b> ${new Date(now * 1000).toISOString()}</p>`;
  const studentHtml = `<p>Hello ${name},</p><p>Thank you for registering your interest in <b>${safeCourse}</b> with Celerity Networks Ltd.</p><p>We have received your registration for <b>${safeMode}</b> training.</p><p><b>Course duration:</b> ${courseDuration}<br/><b>Training fee:</b> ${courseFee}</p><p>Our team will contact you about schedules and the next steps.</p><p>Your registration reference is <b>${registrationId}</b>.</p><p>If you need assistance, contact us at celeritynetworksltd@gmail.com or +234 902 547 6588.</p><p>Regards,<br/>Celerity Networks Ltd</p>`;
  try {
    await Promise.all([
      sendEmail(env, { to: ADMIN_EMAIL, subject: `New student registration: ${fullName}`, html: adminHtml, replyTo: email }),
      sendEmail(env, { to: email, subject: 'We received your Celerity Networks registration', html: studentHtml })
    ]);
  } catch (error) {
    // Registration remains saved even if the email provider has a temporary outage.
    console.error('Registration saved, but one or more emails failed', registrationId, error);
    return json({ ok: true, emailPending: true, message: 'Your registration has been saved. Email confirmation may be delayed. If you do not hear from us, contact Celerity Networks.' });
  }
  return json({ ok: true, message: 'Registration received. Please check your email for a confirmation. Our team will follow up about schedules, fees and next steps.' }, 201);
}
