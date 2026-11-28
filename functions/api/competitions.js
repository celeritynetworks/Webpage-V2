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

export async function onRequestGet({ request, env }) {
  if (!env.REGISTRATIONS) {
    return json({ error: 'Competition service is temporarily unavailable.' }, 503);
  }

  const url = new URL(request.url);
  const status = (url.searchParams.get('status') || '').trim();
  const industry = (url.searchParams.get('industry') || '').trim().slice(0, 80);

  if (status && !['upcoming', 'active', 'completed'].includes(status)) {
    return json({ error: 'Invalid competition status.' }, 400);
  }

  const conditions = ["c.status IN ('upcoming', 'active', 'completed')"];
  const bindings = [];

  if (status) {
    conditions.push(`(CASE WHEN c.status IN ('upcoming', 'active') THEN CASE WHEN c.ends_at < unixepoch() THEN 'completed' WHEN c.starts_at <= unixepoch() THEN 'active' ELSE 'upcoming' END ELSE c.status END) = ?`);
    bindings.push(status);
  }

  if (industry) {
    conditions.push('i.slug = ?');
    bindings.push(industry);
  }

  try {
    const result = await env.REGISTRATIONS.prepare(`
      SELECT
        c.id,
        c.title,
        c.slug,
        c.description,
        c.industry_id,
        i.name AS industry_name,
        i.slug AS industry_slug,
        c.difficulty,
        c.instructions,
        c.dataset_file_name,
        c.dataset_file_format,
        c.dataset_file_size_bytes,
        c.thumbnail_key,
        c.record_count,
        c.registration_opens_at,
        c.registration_closes_at,
        c.starts_at,
        c.ends_at,
        c.updated_at,
        CASE WHEN c.status IN ('upcoming', 'active') THEN CASE WHEN c.ends_at < unixepoch() THEN 'completed' WHEN c.starts_at <= unixepoch() THEN 'active' ELSE 'upcoming' END ELSE c.status END AS status
      FROM competitions c
      LEFT JOIN industries i ON i.id = c.industry_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE WHEN c.status IN ('upcoming', 'active') AND c.starts_at <= unixepoch() AND c.ends_at >= unixepoch() THEN 0
             WHEN c.status IN ('upcoming', 'active') AND c.starts_at > unixepoch() THEN 1 ELSE 2 END,
        c.starts_at DESC
      LIMIT 50
    `).bind(...bindings).all();

    const competitions = (result.results || []).map(item => {
      const { thumbnail_key, ...publicItem } = item;
      return { ...publicItem, thumbnail_url: thumbnail_key ? `/api/competitions/${encodeURIComponent(item.slug)}/thumbnail?v=${Number(item.updated_at || 0)}` : null };
    });
    return json({ ok: true, competitions });
  } catch (error) {
    console.error('Competition listing failed:', error);
    return json({ error: 'Unable to load competitions at this time.' }, 503);
  }
}
