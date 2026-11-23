import { parseMultipartForm, validateUploadedFile } from "./_upload.js";
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
const ALLOWED_STATUSES = ["draft", "upcoming"];
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
        c.record_count,
        c.registration_opens_at,
        c.registration_closes_at,
        c.starts_at,
        c.ends_at,
        c.status,
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
    MAX_FILE_SIZE + 1024 * 1024
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

  const title = cleanText(form.get("title"), 150);
  const slug = cleanText(form.get("slug"), 140).toLowerCase();
  const description = cleanText(form.get("description"), 3000);
  const industryId = cleanText(form.get("industry_id"), 80) || null;
  const difficulty = cleanText(form.get("difficulty"), 30);
  const instructions = cleanText(form.get("instructions"), 10000);
  const status = cleanText(form.get("status"), 20);
  const recordValue = cleanText(form.get("record_count"), 20);
  const recordCount = recordValue === "" ? null : Number(recordValue);

  const registrationOpens = parseDate(form.get("registration_opens_at"));
  const registrationCloses = parseDate(form.get("registration_closes_at"));
  const startsAt = parseDate(form.get("starts_at"), true);
  const endsAt = parseDate(form.get("ends_at"), true);
  const file = form.get("file");

  if (!title || !description || !instructions || !validSlug(slug)) {
    return json({
      success: false,
      message: "Complete the required competition details and use a valid URL slug."
    }, 400);
  }

  if (!ALLOWED_DIFFICULTIES.includes(difficulty)) {
    return json({ success: false, message: "Select a valid difficulty level." }, 400);
  }

  if (!ALLOWED_STATUSES.includes(status)) {
    return json({ success: false, message: "Select draft or upcoming status." }, 400);
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

  if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0) {
    return json({ success: false, message: "Select a competition dataset or challenge package to upload." }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return json({ success: false, message: "The maximum upload size is 50 MB." }, 413);
  }

  const originalName = typeof file.name === "string" ? file.name : "";
  const extension = originalName.split(".").pop()?.toLowerCase();

  if (!ALLOWED_FORMATS.includes(extension)) {
    return json({
      success: false,
      message: "Allowed file formats: CSV, XLSX, XLS, ZIP, JSON and Parquet."
    }, 400);
  }

  const fileBytes = await file.arrayBuffer();
  const fileValidation = validateUploadedFile(fileBytes, extension);

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

  const id = crypto.randomUUID();
  const storedName = safeFileName(originalName);

  if (!storedName || !storedName.includes(".")) {
    return json({ success: false, message: "Invalid upload filename." }, 400);
  }

  const fileKey = `competitions/${id}/${storedName}`;
  const now = Math.floor(Date.now() / 1000);

  try {
    await env.DATASETS_BUCKET.put(fileKey, fileBytes, {
      httpMetadata: {
        contentType: "application/octet-stream"
      },
      customMetadata: {
        competitionId: id,
        uploadedBy: data.admin.email
      }
    });

    await env.REGISTRATIONS.prepare(`
      INSERT INTO competitions (
        id,
        title,
        slug,
        description,
        industry_id,
        difficulty,
        instructions,
        dataset_file_key,
        dataset_file_name,
        dataset_file_format,
        dataset_file_size_bytes,
        record_count,
        registration_opens_at,
        registration_closes_at,
        starts_at,
        ends_at,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      title,
      slug,
      description,
      industryId,
      difficulty,
      instructions,
      fileKey,
      storedName,
      extension,
      file.size,
      recordCount,
      registrationOpens,
      registrationCloses,
      startsAt,
      endsAt,
      status,
      now,
      now
    ).run();

    return json({
      success: true,
      message: status === "upcoming"
        ? "Competition uploaded and published as upcoming."
        : "Competition uploaded and saved as a draft.",
      competition: {
        id,
        title,
        slug,
        status,
        dataset_file_name: storedName,
        dataset_file_size_bytes: file.size
      }
    }, 201);
  } catch (error) {
    console.error("Competition upload failed:", error);

    try {
      await env.DATASETS_BUCKET.delete(fileKey);
    } catch (cleanupError) {
      console.error("Competition file cleanup failed:", cleanupError);
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
