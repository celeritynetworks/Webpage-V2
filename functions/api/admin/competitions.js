import { adminJson, validAdminOrigin, readDeletionRequest, writeResourceAudit } from "./_resource-deletion.js";
import { parseMultipartForm, validateUploadedFile } from "./_upload.js";
import { storeThumbnail } from "./_image-upload.js";
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

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_FORMATS = ["csv", "xlsx", "xls", "zip", "json", "parquet"];
const ALLOWED_STATUSES = ["draft", "published", "upcoming", "active"];
const ALLOWED_DIFFICULTIES = ["Beginner", "Intermediate", "Professional"];

function validOrigin(request) {
  const origin = request.headers.get("Origin");
  const requestUrl = new URL(request.url);
  const fetchSite = request.headers.get("Sec-Fetch-Site");

  return Boolean(
    origin &&
    origin === requestUrl.origin &&
    (!fetchSite || fetchSite === "same-origin")
  );
}

function cleanText(value, maxLength) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function validSlug(value) {
  return typeof value === "string" &&
    value.length >= 2 &&
    value.length <= 140 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function safeFileName(value) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(-150);
}

function parseDate(value, required = false) {
  if (typeof value !== "string" || !value.trim()) {
    return required ? null : null;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) return null;

  return Math.floor(timestamp / 1000);
}

export async function onRequestGet({ env, data }) {
  if (!data?.admin?.email) {
    return json({ success: false, message: "Administrator authentication required." }, 401);
  }

  if (!env.REGISTRATIONS) {
    return json({ success: false, message: "Competition service unavailable." }, 503);
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
        CASE WHEN c.status IN ('upcoming', 'active') THEN CASE WHEN c.ends_at < unixepoch() THEN 'completed' WHEN c.starts_at <= unixepoch() THEN 'active' ELSE 'upcoming' END ELSE c.status END AS status,
        c.created_at,
        c.updated_at,
        (
          SELECT COUNT(*)
          FROM competition_participants p
          WHERE p.competition_id = c.id
        ) AS participant_count,
        (
          SELECT COUNT(*)
          FROM competition_project_submissions s
          WHERE s.competition_id = c.id
        ) AS submission_count
      FROM competitions c
      LEFT JOIN industries i ON i.id = c.industry_id
      ORDER BY c.created_at DESC
      LIMIT 100
    `).all();

    return json({
      success: true,
      competitions: result.results || []
    });
  } catch (error) {
    console.error("Admin competition listing failed:", error);
    return json({ success: false, message: "Unable to load competitions." }, 503);
  }
}

export async function onRequestPost({ request, env, data }) {
  if (!data?.admin?.email) {
    return json({ success: false, message: "Administrator authentication required." }, 401);
  }

  if (!env.REGISTRATIONS || !env.DATASETS_BUCKET) {
    return json({ success: false, message: "Competition storage is not configured." }, 503);
  }

  if (!validOrigin(request)) {
    return json({ success: false, message: "Request origin is not permitted." }, 403);
  }

  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("multipart/form-data")) {
    return json({ success: false, message: "Use multipart/form-data for competition uploads." }, 415);
  }

  const uploadResult = await parseMultipartForm(
    request,
    MAX_FILE_SIZE + 6 * 1024 * 1024
  );

  if (uploadResult.error === "too_large") {
    return json({ success: false, message: "Upload request is too large." }, 413);
  }

  if (uploadResult.error === "invalid_length") {
    return json({ success: false, message: "Invalid Content-Length header." }, 400);
  }

  if (uploadResult.error || !uploadResult.form) {
    return json({ success: false, message: "Invalid upload form." }, 400);
  }

  const form = uploadResult.form;

  const editingId = cleanText(form.get("id"), 100);
  const title = cleanText(form.get("title"), 150);
  const slug = cleanText(form.get("slug"), 140).toLowerCase();
  const description = cleanText(form.get("description"), 3000);
  const industryId = cleanText(form.get("industry_id"), 80) || null;
  const difficulty = cleanText(form.get("difficulty"), 30);
  const instructions = cleanText(form.get("instructions"), 10000);
  const requestedStatus = cleanText(form.get("status"), 20);
  const recordValue = cleanText(form.get("record_count"), 20);
  const recordCount = recordValue === "" ? null : Number(recordValue);

  const registrationOpens = parseDate(form.get("registration_opens_at"));
  const registrationCloses = parseDate(form.get("registration_closes_at"));
  const startsAt = parseDate(form.get("starts_at"), true);
  const endsAt = parseDate(form.get("ends_at"), true);
  const file = form.get("file");
  const thumbnail = form.get("thumbnail");
  const reason = cleanText(form.get("reason"), 1000);
  let existing = null;
  if (editingId) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(editingId)) return json({ success: false, message: "Invalid competition record." }, 400);
    existing = await env.REGISTRATIONS.prepare(`SELECT id, title, status, dataset_file_key, dataset_file_name, dataset_file_format, dataset_file_size_bytes, thumbnail_key FROM competitions WHERE id = ? LIMIT 1`).bind(editingId).first();
    if (!existing) return json({ success: false, message: "Competition draft not found. Refresh the records and try again." }, 404);
    if (existing.status === "archived") return json({ success: false, message: "Archived competitions cannot be edited." }, 409);
    if (existing.status !== "draft" && reason.length < 10) return json({ success: false, message: "Provide an audit reason of at least 10 characters when editing a published competition." }, 400);
  }

  if (!title || !description || !instructions || !validSlug(slug)) {
    return json({
      success: false,
      message: "Complete the required competition details and use a valid URL slug."
    }, 400);
  }

  if (!ALLOWED_DIFFICULTIES.includes(difficulty)) {
    return json({ success: false, message: "Select a valid difficulty level." }, 400);
  }

  if (!ALLOWED_STATUSES.includes(requestedStatus)) {
    return json({ success: false, message: "Select draft or publish status." }, 400);
  }

  if (!startsAt || !endsAt || endsAt <= startsAt) {
    return json({ success: false, message: "Enter valid competition start and end dates. The end must be after the start." }, 400);
  }

  if (form.get("registration_opens_at") && !registrationOpens) {
    return json({ success: false, message: "Enter a valid registration opening date." }, 400);
  }

  if (form.get("registration_closes_at") && !registrationCloses) {
    return json({ success: false, message: "Enter a valid registration closing date." }, 400);
  }

  if (registrationOpens && registrationCloses && registrationCloses <= registrationOpens) {
    return json({ success: false, message: "Registration closing must be after registration opening." }, 400);
  }

  if (recordCount !== null && (!Number.isSafeInteger(recordCount) || recordCount < 0)) {
    return json({ success: false, message: "Record count must be a non-negative whole number." }, 400);
  }

  const hasFile = Boolean(file && typeof file.arrayBuffer === "function" && file.size > 0);
  if (!hasFile && !existing) {
    return json({ success: false, message: "Select a competition dataset or challenge package to upload." }, 400);
  }

  if (hasFile && file.size > MAX_FILE_SIZE) {
    return json({ success: false, message: "The maximum upload size is 50 MB." }, 413);
  }

  const originalName = hasFile ? (typeof file.name === "string" ? file.name : "") : existing.dataset_file_name;
  const extension = hasFile ? originalName.split(".").pop()?.toLowerCase() : existing.dataset_file_format;

  if (hasFile && !ALLOWED_FORMATS.includes(extension)) {
    return json({
      success: false,
      message: "Allowed file formats: CSV, XLSX, XLS, ZIP, JSON and Parquet."
    }, 400);
  }

  const fileBytes = hasFile ? await file.arrayBuffer() : null;
  const fileValidation = hasFile ? validateUploadedFile(fileBytes, extension) : { valid: true };

  if (!fileValidation.valid) {
    return json({
      success: false,
      message: "The uploaded file contents do not match the selected file format."
    }, 400);
  }

  if (industryId) {
    let industry;

    try {
      industry = await env.REGISTRATIONS.prepare(
        "SELECT id FROM industries WHERE id = ? LIMIT 1"
      ).bind(industryId).first();
    } catch (error) {
      console.error("Competition industry lookup failed:", error);

      return json({
        success: false,
        message: "Unable to validate the selected industry. Please try again."
      }, 503);
    }

    if (!industry) {
      return json({ success: false, message: "Select a valid industry." }, 400);
    }
  }

  const id = editingId || crypto.randomUUID();
  const storedName = hasFile ? safeFileName(originalName) : existing.dataset_file_name;

  if (!storedName || !storedName.includes(".")) {
    return json({ success: false, message: "Invalid upload filename." }, 400);
  }

  const fileKey = hasFile ? `competitions/${id}/${storedName}` : existing.dataset_file_key;
  const now = Math.floor(Date.now() / 1000);
  const status = requestedStatus === "draft" ? "draft" : (startsAt > now ? "upcoming" : endsAt < now ? "completed" : "active");
  let thumbnailKey = existing?.thumbnail_key || null;
  let uploadedThumbnailKey = null;

  try {
    if (hasFile) await env.DATASETS_BUCKET.put(fileKey, fileBytes, {
      httpMetadata: {
        contentType: "application/octet-stream"
      },
      customMetadata: {
        competitionId: id,
        uploadedBy: data.admin.email
      }
    });

    if (thumbnail && typeof thumbnail.arrayBuffer === "function" && thumbnail.size > 0) {
      uploadedThumbnailKey = await storeThumbnail({ file: thumbnail, bucket: env.DATASETS_BUCKET, resourceType: "competitions", resourceId: id, adminEmail: data.admin.email });
      thumbnailKey = uploadedThumbnailKey;
    }

    if (existing) {
      const updateStatement = env.REGISTRATIONS.prepare(`
        UPDATE competitions SET title = ?, slug = ?, description = ?, industry_id = ?, difficulty = ?,
          instructions = ?, dataset_file_key = ?, dataset_file_name = ?, dataset_file_format = ?,
          dataset_file_size_bytes = ?, record_count = ?, registration_opens_at = ?, registration_closes_at = ?,
          starts_at = ?, ends_at = ?, status = ?, thumbnail_key = ?, updated_at = ? WHERE id = ?
      `).bind(title, slug, description, industryId, difficulty, instructions, fileKey, storedName, extension,
        hasFile ? file.size : existing.dataset_file_size_bytes, recordCount, registrationOpens,
        registrationCloses, startsAt, endsAt, status, thumbnailKey, now, id);
      if (existing.status !== "draft") {
        const auditStatement = env.REGISTRATIONS.prepare(`
          INSERT INTO admin_resource_audit (id, resource_type, resource_id, resource_name, action, reason, admin_email, created_at)
          VALUES (?, 'competition', ?, ?, 'updated', ?, ?, ?)
        `).bind(crypto.randomUUID(), id, title, reason, data.admin.email, now);
        await env.REGISTRATIONS.batch([updateStatement, auditStatement]);
      } else {
        await updateStatement.run();
      }
      if (hasFile && existing.dataset_file_key && existing.dataset_file_key !== fileKey) {
        try { await env.DATASETS_BUCKET.delete(existing.dataset_file_key); } catch (cleanupError) { console.error("Old competition dataset cleanup failed:", cleanupError); }
      }
      if (uploadedThumbnailKey && existing.thumbnail_key && existing.thumbnail_key !== uploadedThumbnailKey) {
        try { await env.DATASETS_BUCKET.delete(existing.thumbnail_key); } catch (cleanupError) { console.error("Old competition thumbnail cleanup failed:", cleanupError); }
      }
    } else {
      await env.REGISTRATIONS.prepare(`
        INSERT INTO competitions (
          id, title, slug, description, industry_id, difficulty, instructions, dataset_file_key,
          dataset_file_name, dataset_file_format, dataset_file_size_bytes, record_count,
          registration_opens_at, registration_closes_at, starts_at, ends_at, status, thumbnail_key,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, title, slug, description, industryId, difficulty, instructions, fileKey, storedName,
        extension, file.size, recordCount, registrationOpens, registrationCloses, startsAt, endsAt,
        status, thumbnailKey, now, now).run();
    }

    return json({
      success: true,
      message: existing ? (status === "draft" ? "Competition draft updated." : `Competition updated and published as ${status}.`) : (status === "draft" ? "Competition uploaded and saved as a draft." : `Competition uploaded and published as ${status}.`),
      competition: {
        id,
        title,
        slug,
        status,
        dataset_file_name: storedName,
        dataset_file_size_bytes: hasFile ? file.size : existing.dataset_file_size_bytes,
        thumbnail_key: thumbnailKey
      }
    }, existing ? 200 : 201);
  } catch (error) {
    console.error("Competition upload failed:", error);

    try {
      if (hasFile) await env.DATASETS_BUCKET.delete(fileKey);
      if (uploadedThumbnailKey) await env.DATASETS_BUCKET.delete(uploadedThumbnailKey);
    } catch (cleanupError) {
      console.error("Competition upload cleanup failed:", cleanupError);
    }

    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return json({
        success: false,
        message: "That competition URL slug is already in use. Choose another slug."
      }, 409);
    }

    return json({
      success: false,
      message: "The competition could not be saved. Please try again."
    }, 503);
  }
}


export async function onRequestDelete({ request, env, data }) {
  if (!data?.admin?.email) {
    return adminJson({ success: false, message: "Administrator authentication required." }, 401);
  }
  if (!env.REGISTRATIONS || !env.DATASETS_BUCKET) {
    return adminJson({ success: false, message: "Competition storage is not configured." }, 503);
  }
  if (!validAdminOrigin(request)) {
    return adminJson({ success: false, message: "Request origin is not permitted." }, 403);
  }

  const input = await readDeletionRequest(request);
  if (input.error) return input.error;

  const { id, reason, confirmName } = input;
  let competition;

  try {
    competition = await env.REGISTRATIONS.prepare(`
      SELECT
        c.id, c.title, c.dataset_file_key, c.thumbnail_key,
        (SELECT COUNT(*) FROM competition_participants p
          WHERE p.competition_id = c.id) AS participant_count,
        (SELECT COUNT(*) FROM competition_project_submissions s
          WHERE s.competition_id = c.id) AS project_submission_count,
        (SELECT COUNT(*) FROM competition_submissions s
          WHERE s.competition_id = c.id) AS legacy_submission_count
      FROM competitions c
      WHERE c.id = ?
      LIMIT 1
    `).bind(id).first();
  } catch (error) {
    console.error("Competition deletion lookup failed:", error);
    return adminJson({ success: false, message: "Unable to verify competition history before deletion." }, 503);
  }

  if (!competition) {
    return adminJson({ success: false, message: "Competition not found. Refresh the records and try again." }, 404);
  }
  if (confirmName !== competition.title) {
    return adminJson({ success: false, message: "The confirmation title does not match this competition." }, 409);
  }

  const now = Math.floor(Date.now() / 1000);
  let resourceDeleted = false;

  try {
    await writeResourceAudit(env.REGISTRATIONS, {
      resourceType: "competition",
      resourceId: competition.id,
      resourceName: competition.title,
      action: "delete_requested",
      reason,
      adminEmail: data.admin.email
    });

    // Close registration and submission entry points before checking history.
    // Their final INSERT statements also require an eligible competition status.
    await env.REGISTRATIONS.prepare(`
      UPDATE competitions
      SET status = 'archived', updated_at = ?
      WHERE id = ?
    `).bind(now, id).run();

    const history = await env.REGISTRATIONS.prepare(`
      SELECT
        (SELECT COUNT(*) FROM competition_participants p
          WHERE p.competition_id = ?) AS participant_count,
        (SELECT COUNT(*) FROM competition_project_submissions s
          WHERE s.competition_id = ?) AS project_submission_count,
        (SELECT COUNT(*) FROM competition_submissions s
          WHERE s.competition_id = ?) AS legacy_submission_count
    `).bind(id, id, id).first();

    const participantCount = Number(history?.participant_count || 0);
    const projectSubmissionCount = Number(history?.project_submission_count || 0);
    const legacySubmissionCount = Number(history?.legacy_submission_count || 0);
    const hasHistory = participantCount > 0 || projectSubmissionCount > 0 || legacySubmissionCount > 0;

    if (hasHistory) {
      await writeResourceAudit(env.REGISTRATIONS, {
        resourceType: "competition",
        resourceId: competition.id,
        resourceName: competition.title,
        action: "archived",
        reason,
        adminEmail: data.admin.email
      });

      return adminJson({
        success: true,
        action: "archived",
        participant_count: participantCount,
        submission_count: projectSubmissionCount + legacySubmissionCount,
        message: "This competition has participant or submission history. It was archived instead of permanently deleted. Its dataset and historical records were preserved."
      });
    }

    // No history remains after archiving, so no new registrations or submissions
    // can enter while the permanent deletion is being completed.
    if (competition.dataset_file_key) await env.DATASETS_BUCKET.delete(competition.dataset_file_key);
    if (competition.thumbnail_key) await env.DATASETS_BUCKET.delete(competition.thumbnail_key);

    await env.REGISTRATIONS.prepare(
      "DELETE FROM competitions WHERE id = ?"
    ).bind(id).run();
    resourceDeleted = true;

    await writeResourceAudit(env.REGISTRATIONS, {
      resourceType: "competition",
      resourceId: competition.id,
      resourceName: competition.title,
      action: "deleted",
      reason,
      adminEmail: data.admin.email
    });

    return adminJson({
      success: true,
      action: "deleted",
      message: "Competition and its stored challenge file were deleted. The administrative audit record was preserved."
    });
  } catch (error) {
    console.error("Competition deletion failed:", error);
    if (!resourceDeleted) {
      try {
        await writeResourceAudit(env.REGISTRATIONS, {
          resourceType: "competition",
          resourceId: competition.id,
          resourceName: competition.title,
          action: "delete_failed",
          reason,
          adminEmail: data.admin.email
        });
      } catch (auditError) {
        console.error("Competition deletion failure audit could not be recorded:", auditError);
      }
    }
    return adminJson({
      success: false,
      message: resourceDeleted
        ? "The competition record was deleted, but the final audit event could not be confirmed. Contact an administrator to reconcile the audit history."
        : "Competition deletion did not complete. The record has been kept archived for safety. Refresh and contact an administrator if it remains unavailable."
    }, 503);
  }
}

export async function onRequestPut(context) {
  return onRequestPost(context);
}
