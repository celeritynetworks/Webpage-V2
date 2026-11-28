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

function parseJson(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.REGISTRATIONS) {
    return json({ error: 'Dataset service is temporarily unavailable.' }, 503);
  }

  const url = new URL(request.url);
  const industry = (url.searchParams.get('industry') || '').trim().slice(0, 80);
  const difficulty = (url.searchParams.get('difficulty') || '').trim();
  const search = (url.searchParams.get('q') || '').trim().slice(0, 100);

  const page = Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1));
  const limit = Math.max(1, Math.min(30, Number.parseInt(url.searchParams.get('limit') || '12', 10) || 12));
  const offset = (page - 1) * limit;

  if (difficulty && !['Beginner', 'Intermediate', 'Professional'].includes(difficulty)) {
    return json({ error: 'Invalid difficulty filter.' }, 400);
  }

  const conditions = ["d.status = 'published'"];
  const bindings = [];

  if (industry) {
    conditions.push('i.slug = ?');
    bindings.push(industry);
  }

  if (difficulty) {
    conditions.push('d.difficulty = ?');
    bindings.push(difficulty);
  }

  if (search) {
    conditions.push('(d.title LIKE ? OR d.description LIKE ?)');
    bindings.push(`%${search}%`, `%${search}%`);
  }

  const where = conditions.join(' AND ');

  try {
    const countResult = await env.REGISTRATIONS.prepare(`
      SELECT COUNT(*) AS total
      FROM datasets d
      JOIN industries i ON i.id = d.industry_id
      WHERE ${where}
    `).bind(...bindings).first();

    const result = await env.REGISTRATIONS.prepare(`
      SELECT
        d.id,
        d.title,
        d.slug,
        d.description,
        d.difficulty,
        d.file_name,
        d.file_format,
        d.file_size_bytes,
        d.thumbnail_key,
        d.record_count,
        d.column_count,
        d.learning_objectives,
        d.tags,
        d.download_count,
        d.published_at,
        d.updated_at,
        i.name AS industry_name,
        i.slug AS industry_slug
      FROM datasets d
      JOIN industries i ON i.id = d.industry_id
      WHERE ${where}
      ORDER BY d.published_at DESC, d.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...bindings, limit, offset).all();

    const datasets = (result.results || []).map(item => {
      const { thumbnail_key, ...publicItem } = item;
      return {
        ...publicItem,
        learning_objectives: parseJson(item.learning_objectives),
        tags: parseJson(item.tags),
        thumbnail_url: thumbnail_key ? `/api/datasets/${encodeURIComponent(item.slug)}/thumbnail?v=${Number(item.updated_at || item.published_at || 0)}` : null
      };
    });

    const total = countResult?.total || 0;

    return json({
      ok: true,
      datasets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Dataset listing failed:', error);
    return json({ error: 'Unable to load datasets at this time.' }, 503);
  }
}
