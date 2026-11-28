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

const VALID_STATUSES = [
  "submitted",
  "reviewing",
  "shortlisted",
  "winner",
  "not_selected",
  "requires_revision"
];
async function readTextWithLimit(request, maxBytes) {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function onRequestPost({ request, env, data }) {
  const reviewerEmail = data?.admin?.email;

  if (!reviewerEmail) {
    return json({
      success: false,
      message: "Administrator authentication required."
    }, 401);
  }

  if (!env.REGISTRATIONS) {
    return json({
      success: false,
      message: "The review service is unavailable."
    }, 503);
  }

  const origin = request.headers.get("Origin");
  const requestUrl = new URL(request.url);

  if (
    !origin ||
    origin !== requestUrl.origin ||
    (
      request.headers.get("Sec-Fetch-Site") &&
      request.headers.get("Sec-Fetch-Site") !== "same-origin"
    )
  ) {
    return json({
      success: false,
      message: "Request origin is not permitted."
    }, 403);
  }

  const contentType = request.headers.get("Content-Type") || "";

  if (!contentType.toLowerCase().startsWith("application/json")) {
    return json({
      success: false,
      message: "Content-Type must be application/json."
    }, 415);
  }

  const contentLengthHeader = request.headers.get("Content-Length");

  if (contentLengthHeader !== null) {
    if (!/^\d+$/.test(contentLengthHeader)) {
      return json({
        success: false,
        message: "Invalid Content-Length header."
      }, 400);
    }

    const contentLength = Number(contentLengthHeader);

    if (!Number.isSafeInteger(contentLength) || contentLength > 16384) {
      return json({
        success: false,
        message: "Request body is too large."
      }, 413);
    }
  }

  let body;

  try {
    const rawBody = await readTextWithLimit(request, 16384);

    if (rawBody === null) {
      return json({
        success: false,
        message: "Request body is too large."
      }, 413);
    }

    body = JSON.parse(rawBody);
  } catch {
    return json({
      success: false,
      message: "Invalid JSON request body."
    }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({
      success: false,
      message: "Invalid review data."
    }, 400);
  }

  const submissionId = body.submission_id;
  const score = body.score;
  const status = body.status;
  const feedback = body.feedback;
  const reason = body.reason;

  if (
    typeof submissionId !== "string" ||
    submissionId.length < 1 ||
    submissionId.length > 150 ||
    !/^[A-Za-z0-9_-]+$/.test(submissionId)
  ) {
    return json({
      success: false,
      message: "Invalid submission identifier."
    }, 400);
  }

  if (
    typeof score !== "number" ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100
  ) {
    return json({
      success: false,
      message: "Score must be a number between 0 and 100."
    }, 400);
  }

  if (!VALID_STATUSES.includes(status)) {
    return json({
      success: false,
      message: "Invalid review status."
    }, 400);
  }

  if (
    typeof feedback !== "string" ||
    feedback.length > 5000
  ) {
    return json({
      success: false,
      message: "Feedback must be text and cannot exceed 5,000 characters."
    }, 400);
  }

  if (
    typeof reason !== "string" ||
    reason.trim().length < 10 ||
    reason.trim().length > 1000
  ) {
    return json({
      success: false,
      message: "A revision reason of 10 to 1,000 characters is required."
    }, 400);
  }

  const cleanFeedback = feedback.trim();
  const cleanReason = reason.trim();

  try {
    const db = env.REGISTRATIONS;

    const current = await db.prepare(`
      SELECT
        id,
        score,
        status,
        feedback,
        review_revision
      FROM competition_project_submissions
      WHERE id = ?
      LIMIT 1
    `).bind(submissionId).first();

    if (!current) {
      return json({
        success: false,
        message: "Project submission not found."
      }, 404);
    }

    const reviewId = crypto.randomUUID();

    // Record the old and new values before updating the submission.
    // Both statements run in one D1 batch transaction.
    // The matching conditions prevent overwriting a concurrent review.

    const results = await db.batch([
      db.prepare(`
        INSERT INTO competition_project_submission_reviews (
          id,
          submission_id,
          reviewer_email,
          previous_score,
          new_score,
          previous_status,
          new_status,
          previous_feedback,
          new_feedback,
          reason,
          created_at
        )
        SELECT
          ?,
          ?,
          ?,
          s.score,
          ?,
          s.status,
          ?,
          s.feedback,
          ?,
          ?,
          unixepoch()
        FROM competition_project_submissions s
        WHERE
          s.id = ?
          AND s.review_revision = ?
          AND s.score IS ?
          AND s.status = ?
          AND s.feedback IS ?
      `).bind(
        reviewId,
        submissionId,
        reviewerEmail,
        score,
        status,
        cleanFeedback,
        cleanReason,
        submissionId,
        current.review_revision,
        current.score,
        current.status,
        current.feedback
      ),

      db.prepare(`
        UPDATE competition_project_submissions
        SET
          review_revision = review_revision + 1,
          score = ?,
          status = ?,
          feedback = ?,
          reviewed_at = unixepoch()
        WHERE
          id = ?
          AND review_revision = ?
          AND score IS ?
          AND status = ?
          AND feedback IS ?
      `).bind(
        score,
        status,
        cleanFeedback,
        submissionId,
        current.review_revision,
        current.score,
        current.status,
        current.feedback
      )
    ]);

    const auditChanges = Number(results[0]?.meta?.changes || 0);
    const submissionChanges = Number(results[1]?.meta?.changes || 0);

    if (auditChanges !== 1 || submissionChanges !== 1) {
      return json({
        success: false,
        message: "The submission changed during review. Reload it before trying again."
      }, 409);
    }

    return json({
      success: true,
      message: "Project review saved successfully.",
      review: {
        id: reviewId,
        submission_id: submissionId,
        reviewer_email: reviewerEmail,
        score,
        status,
        feedback: cleanFeedback
      }
    });

  } catch (error) {
    console.error("Admin project review failed:", error);

    return json({
      success: false,
      message: "Unable to save the project review."
    }, 503);
  }
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
      message: "The review service is unavailable."
    }, 503);
  }

  const submissionId = new URL(request.url).searchParams.get("submission_id");

  if (
    !submissionId ||
    submissionId.length > 150 ||
    !/^[A-Za-z0-9_-]+$/.test(submissionId)
  ) {
    return json({
      success: false,
      message: "A valid submission identifier is required."
    }, 400);
  }

  try {
    const result = await env.REGISTRATIONS.prepare(`
      SELECT
        id,
        submission_id,
        reviewer_email,
        previous_score,
        new_score,
        previous_status,
        new_status,
        previous_feedback,
        new_feedback,
        reason,
        created_at
      FROM competition_project_submission_reviews
      WHERE submission_id = ?
      ORDER BY created_at DESC, id DESC
    `).bind(submissionId).all();

    return json({
      success: true,
      reviews: result.results || []
    });

  } catch (error) {
    console.error("Admin review history retrieval failed:", error);

    return json({
      success: false,
      message: "Unable to load review history."
    }, 503);
  }
}
