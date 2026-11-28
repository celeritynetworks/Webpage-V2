function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function onRequestGet({ request, env, data }) {
  if (!data?.admin?.email) {
    return json({
      success: false,
      message: "Administrator authentication required."
    }, 401);
  }

  if (!env.REGISTRATIONS) {
    return json({
      success: false,
      message: "The submission review service is unavailable."
    }, 503);
  }

  const params = new URL(request.url).searchParams;

  const requestedLimit = Number(params.get("limit") || 50);
  const requestedOffset = Number(params.get("offset") || 0);

  if (
    !Number.isInteger(requestedLimit) ||
    requestedLimit < 1 ||
    requestedLimit > 100 ||
    !Number.isInteger(requestedOffset) ||
    requestedOffset < 0 ||
    requestedOffset > 100000
  ) {
    return json({
      success: false,
      message: "Invalid pagination parameters."
    }, 400);
  }

  const status = params.get("status");
  const competitionId = params.get("competition_id");

  const validStatuses = [
    "submitted",
    "reviewing",
    "shortlisted",
    "winner",
    "not_selected",
    "requires_revision"
  ];

  if (status && !validStatuses.includes(status)) {
    return json({
      success: false,
      message: "Invalid submission status."
    }, 400);
  }

  if (
    competitionId &&
    (
      competitionId.length > 150 ||
      !/^[A-Za-z0-9_-]+$/.test(competitionId)
    )
  ) {
    return json({
      success: false,
      message: "Invalid competition identifier."
    }, 400);
  }

  const conditions = [];
  const bindings = [];

  if (status) {
    conditions.push("s.status = ?");
    bindings.push(status);
  }

  if (competitionId) {
    conditions.push("s.competition_id = ?");
    bindings.push(competitionId);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  // Summary statistics follow the competition filter,
  // but intentionally ignore the submission status filter.
  const statsConditions = [];
  const statsBindings = [];

  if (competitionId) {
    statsConditions.push("competition_id = ?");
    statsBindings.push(competitionId);
  }

  const statsWhereClause = statsConditions.length
    ? `WHERE ${statsConditions.join(" AND ")}`
    : "";

  try {
    const db = env.REGISTRATIONS;

    const countResult = await db.prepare(`
      SELECT COUNT(*) AS total
      FROM competition_project_submissions s
      ${whereClause}
    `).bind(...bindings).first();

    const total = Number(countResult?.total || 0);

    const statsResult = await db.prepare(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(
          CASE
            WHEN status IN ('submitted', 'reviewing') THEN 1
            ELSE 0
          END
        ), 0) AS awaiting_review,
        COALESCE(SUM(
          CASE WHEN status = 'shortlisted' THEN 1 ELSE 0 END
        ), 0) AS shortlisted,
        COALESCE(SUM(
          CASE WHEN status = 'winner' THEN 1 ELSE 0 END
        ), 0) AS winners,
        COALESCE(SUM(
          CASE WHEN reviewed_at IS NOT NULL THEN 1 ELSE 0 END
        ), 0) AS reviewed
      FROM competition_project_submissions
      ${statsWhereClause}
    `).bind(...statsBindings).first();

    const competitionsResult = await db.prepare(`
      SELECT
        id,
        title,
        slug,
        status
      FROM competitions
      ORDER BY starts_at DESC, title ASC
    `).all();

    const result = await db.prepare(`
      SELECT
        s.id,
        s.competition_id,
        s.participant_id,
        s.participant_name,
        s.participant_email,
        s.repository_url,
        s.repository_owner,
        s.repository_name,
        s.status,
        s.score,
        s.feedback,
        s.submitted_at,
        s.reviewed_at,
        s.ownership_confirmed,
        s.public_repository_confirmed,
        s.declaration_version,
        s.declarations_accepted_at,

        c.title AS competition_title,
        c.slug AS competition_slug,
        c.status AS competition_status,

        (
          SELECT COUNT(*)
          FROM competition_project_submission_reviews r
          WHERE r.submission_id = s.id
        ) AS review_count

      FROM competition_project_submissions s

      INNER JOIN competitions c
        ON c.id = s.competition_id

      ${whereClause}

      ORDER BY s.submitted_at DESC, s.id ASC

      LIMIT ?
      OFFSET ?
    `).bind(
      ...bindings,
      requestedLimit,
      requestedOffset
    ).all();

    const stats = {
      total: Number(statsResult?.total || 0),
      awaiting_review: Number(statsResult?.awaiting_review || 0),
      shortlisted: Number(statsResult?.shortlisted || 0),
      winners: Number(statsResult?.winners || 0),
      reviewed: Number(statsResult?.reviewed || 0)
    };

    return json({
      success: true,
      total,
      stats,
      competitions: competitionsResult.results || [],
      pagination: {
        total,
        limit: requestedLimit,
        offset: requestedOffset,
        has_more: requestedOffset + (result.results?.length || 0) < total
      },
      submissions: result.results || []
    });

  } catch (error) {
    console.error("Admin submission listing failed:", error);

    return json({
      success: false,
      message: "Unable to load project submissions."
    }, 503);
  }
}
