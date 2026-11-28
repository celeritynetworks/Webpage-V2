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

export async function onRequestGet({ env }) {
  if (!env.REGISTRATIONS) {
    return json({ error: 'Industry service is temporarily unavailable.' }, 503);
  }

  try {
    const result = await env.REGISTRATIONS.prepare(`
      SELECT id, name, slug, description
      FROM industries
      ORDER BY name ASC
    `).all();

    return json({ ok: true, industries: result.results || [] });
  } catch (error) {
    console.error('Industry listing failed:', error);
    return json({ error: 'Unable to load industries at this time.' }, 503);
  }
}
