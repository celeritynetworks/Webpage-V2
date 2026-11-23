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

export async function onRequestGet({ request, env }) {
  if (!env.REGISTRATIONS) {
    return json({ error: 'Participant service is temporarily unavailable.' }, 503);
  }

  const token = getSessionToken(request);

  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return json({
      authenticated: false,
      error: 'Please sign in to continue.'
    }, 401);
  }

  try {
    const sessionHash = await hashSession(token);
    const now = Math.floor(Date.now() / 1000);

    const participant = await env.REGISTRATIONS.prepare(`
      SELECT
        p.id,
        p.full_name,
        p.email,
        p.phone,
        p.organization,
        p.status,
        p.registered_at,
        p.verified_at,

        c.id AS competition_id,
        c.slug AS competition_slug,
        c.title AS competition_title,
        c.description AS competition_description,
        c.instructions AS competition_instructions,
        c.difficulty AS competition_difficulty,
        c.status AS competition_status,
        c.starts_at,
        c.ends_at,
        c.dataset_file_name,

        s.expires_at AS session_expires_at,


        proj.id AS project_submission_id,
        proj.repository_url AS project_submission_repository_url,
        proj.status AS project_submission_status,
        proj.score AS project_submission_score,
        proj.feedback AS project_submission_feedback,
        proj.submitted_at AS project_submission_submitted_at,
        proj.reviewed_at AS project_submission_reviewed_at,
        proj.public_display_name AS project_submission_public_display_name,
        proj.public_bio AS project_submission_public_bio,
        proj.portfolio_url AS project_submission_portfolio_url,
        proj.linkedin_url AS project_submission_linkedin_url,
        proj.public_profile_enabled AS project_submission_public_profile_enabled

      FROM competition_participant_sessions s

      INNER JOIN competition_participants p
        ON p.id = s.participant_id

      INNER JOIN competitions c
        ON c.id = p.competition_id


      LEFT JOIN competition_project_submissions proj
        ON proj.competition_id = c.id
       AND proj.participant_id = p.id

      WHERE s.session_hash = ?
        AND s.expires_at > ?
        AND s.revoked_at IS NULL
        AND p.verified_at IS NOT NULL
        AND p.status = 'registered'

      LIMIT 1
    `).bind(sessionHash, now).first();

    if (!participant) {
      return json({
        authenticated: false,
        error: 'Your session is invalid or has expired. Please sign in again.'
      }, 401);
    }

    return json({
      authenticated: true,

      participant: {
        id: participant.id,
        full_name: participant.full_name,
        email: participant.email,
        phone: participant.phone,
        organization: participant.organization,
        status: participant.status,
        registered_at: participant.registered_at,
        verified_at: participant.verified_at,
        session_expires_at: participant.session_expires_at,

        competition: {
          id: participant.competition_id,
          slug: participant.competition_slug,
          title: participant.competition_title,
          description: participant.competition_description,
          instructions: participant.competition_instructions,
          difficulty: participant.competition_difficulty,
          status: participant.competition_status,
          starts_at: participant.starts_at,
          ends_at: participant.ends_at,
          dataset_file_name: participant.dataset_file_name
        },


        project_submission: participant.project_submission_id ? {
          id: participant.project_submission_id,
          repository_url: participant.project_submission_repository_url,
          status: participant.project_submission_status,
          score: participant.project_submission_score,
          feedback: participant.project_submission_feedback,
          submitted_at: participant.project_submission_submitted_at,
          reviewed_at: participant.project_submission_reviewed_at,
          public_display_name: participant.project_submission_public_display_name,
          public_bio: participant.project_submission_public_bio,
          portfolio_url: participant.project_submission_portfolio_url,
          linkedin_url: participant.project_submission_linkedin_url,
          public_profile_enabled: participant.project_submission_public_profile_enabled
        } : null
      }
    });

  } catch (error) {
    console.error('Participant session lookup failed:', error);

    return json({
      error: 'Unable to retrieve your participant profile at this time.'
    }, 503);
  }
}
