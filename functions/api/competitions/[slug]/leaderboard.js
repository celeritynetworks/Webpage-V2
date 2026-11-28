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

function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function onRequestGet({ params, env }) {
  if (!env.REGISTRATIONS) {
    return json({ error: 'Leaderboard service is temporarily unavailable.' }, 503);
  }

  const slug = String(params.slug || '').trim();

  if (!slug || slug.length > 120) {
    return json({ error: 'Invalid competition.' }, 400);
  }

  try {
    const competition = await env.REGISTRATIONS.prepare(`
      SELECT id, title, slug, status, ends_at
      FROM competitions
      WHERE slug = ?
        AND status IN ('upcoming', 'active', 'completed')
      LIMIT 1
    `).bind(slug).first();

    if (!competition) {
      return json({ error: 'Competition not found.' }, 404);
    }

    const [rankingResult, winner] = await Promise.all([
      env.REGISTRATIONS.prepare(`
        SELECT
          id,
          COALESCE(NULLIF(public_display_name, ''), 'Participant') AS name,
          score,
          submitted_at,
          portfolio_url,
          linkedin_url
        FROM competition_project_submissions
        WHERE competition_id = ?
          AND score IS NOT NULL
          AND status IN ('shortlisted', 'winner')
          AND public_profile_enabled = 1
        ORDER BY score DESC, submitted_at ASC
        LIMIT 10
      `).bind(competition.id).all(),

      env.REGISTRATIONS.prepare(`
        SELECT
          id,
          COALESCE(NULLIF(public_display_name, ''), 'Participant') AS name,
          public_bio,
          score,
          portfolio_url,
          linkedin_url
        FROM competition_project_submissions
        WHERE competition_id = ?
          AND status = 'winner'
          AND score IS NOT NULL
          AND public_profile_enabled = 1
        ORDER BY score DESC, submitted_at ASC
        LIMIT 1
      `).bind(competition.id).first()
    ]);

    const leaderboard = (rankingResult.results || []).map((item, index) => ({
      rank: index + 1,
      name: item.name,
      score: item.score,
      portfolio_url: safeUrl(item.portfolio_url),
      linkedin_url: safeUrl(item.linkedin_url)
    }));

    const featuredWinner = winner ? {
      name: winner.name,
      bio: winner.public_bio || '',
      score: winner.score,
      portfolio_url: safeUrl(winner.portfolio_url),
      linkedin_url: safeUrl(winner.linkedin_url)
    } : null;

    return json({
      ok: true,
      competition,
      leaderboard,
      winner: featuredWinner
    });
  } catch (error) {
    console.error('Leaderboard request failed:', error);
    return json({ error: 'Unable to load the leaderboard.' }, 503);
  }
}