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
const ALLOWED_STATUSES = ["draft", "published"];

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

function parseList(value, maxItems, maxLength) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;

    const cleaned = parsed
      .filter(item => typeof item === "string")
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, maxItems);

    if (cleaned.some(item => item.length > maxLength)) return null;

    return cleaned;
  } catch {
    return null;
  }
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

export async function onRequestGet({ env, data }) {
  if (!data?.admin?.email) {
    return json({ success: false, message: "Administrator authentication required." }, 401);
  }

  if (!env.REGISTRATIONS) {
    return json({ success: false, message: "Dataset service unavailable." }, 503);
  }

  try {
    const result = await env.REGISTRATIONS.prepare(`
      SELECT
        d.id,
        d.industry_id,
        i.name AS industry_name,
        d.title,
        d.slug,
        d.description,
        d.difficulty,
        d.file_name,
        d.file_format,
        d.file_size_bytes,
        d.record_count,
        d.column_count,
        d.learning_objectives,
        d.tags,
        d.status,
        d.download_count,
        d.created_at,
        d.updated_at,
        d.published_at
      FROM datasets d
      JOIN industries i ON i.id = d.industry_id
      ORDER BY d.created_at DESC
      LIMIT 100
    `).all();

    const datasets = (result.results || []).map(item => {
      let objectives = [];
      let tags = [];

      try {
        objectives = JSON.parse(item.learning_objectives || "[]");
        if (!Array.isArray(objectives)) objectives = [];
      } catch {}

      try {
        tags = JSON.parse(item.tags || "[]");
        if (!Array.isArray(tags)) tags = [];
      } catch {}

      return {
        ...item,
        learning_objectives: objectives,
        tags
      };
    });

    return json({ success: true, datasets });
  } catch (error) {
    console.error("Admin dataset listing failed:", error);
    return json({ success: false, message: "Unable to load datasets." }, 503);
  }
}

export async function onRequestPost({ request, env, data }) {
  if (!data?.admin?.email) {
    return json({ success: false, message: "Administrator authentication required." }, 401);
  }

  if (!env.REGISTRATIONS || !env.DATASETS_BUCKET) {
    return json({ success: false, message: "Dataset storage is not configured." }, 503);
  }

  if (!validOrigin(request)) {
    return json({ success: false, message: "Request origin is not permitted." }, 403);
  }

  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("multipart/form-data")) {
    return json({ success: false, message: "Use multipart/form-data for dataset uploads." }, 415);
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

  const industryId = cleanText(form.get("industry_id"), 80);
  const title = cleanText(form.get("title"), 150);
  const slug = cleanText(form.get("slug"), 140).toLowerCase();
  const description = cleanText(form.get("description"), 3000);
  const difficulty = cleanText(form.get("difficulty"), 30);
  const status = cleanText(form.get("status"), 20);
  const objectives = parseList(form.get("learning_objectives"), 10, 300);
  const tags = parseList(form.get("tags"), 20, 60);
  const recordCount = Number(form.get("record_count"));
  const columnCount = Number(form.get("column_count"));
  const file = form.get("file");

  if (!industryId || !title || !description || !validSlug(slug)) {
    return json({ success: false, message: "Complete the required dataset details and use a valid URL slug." }, 400);
  }

  if (!["Beginner", "Intermediate", "Professional"].includes(difficulty)) {
    return json({ success: false, message: "Select a valid difficulty level." }, 400);
  }

  if (!ALLOWED_STATUSES.includes(status)) {
    return json({ success: false, message: "Select draft or published status." }, 400);
  }

  if (!objectives || objectives.length < 4) {
    return json({ success: false, message: "Provide at least four learning objectives." }, 400);
  }

  if (!tags) {
    return json({ success: false, message: "Tags must be submitted as a valid list." }, 400);
  }

  if (!Number.isSafeInteger(recordCount) || recordCount < 0 ||
      !Number.isSafeInteger(columnCount) || columnCount < 0) {
    return json({ success: false, message: "Record count and column count must be non-negative whole numbers." }, 400);
  }

  if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0) {
    return json({ success: false, message: "Select a dataset package to upload." }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return json({ success: false, message: "The maximum upload size is 50 MB." }, 413);
  }

  const originalName = typeof file.name === "string" ? file.name : "";
  const extension = originalName.split(".").pop()?.toLowerCase();

  if (!ALLOWED_FORMATS.includes(extension)) {
    return json({ success: false, message: "Allowed file formats: CSV, XLSX, XLS, ZIP, JSON and Parquet." }, 400);
  }

  const fileBytes = await file.arrayBuffer();
  const fileValidation = validateUploadedFile(fileBytes, extension);

  if (!fileValidation.valid) {
    return json({
      success: false,
      message: "The uploaded file contents do not match the selected file format."
    }, 400);
  }

  let industry;

  try {
    industry = await env.REGISTRATIONS.prepare(
      "SELECT id FROM industries WHERE id = ? LIMIT 1"
    ).bind(industryId).first();
  } catch (error) {
    console.error("Dataset industry lookup failed:", error);

    return json({
      success: false,
      message: "Unable to validate the selected industry. Please try again."
    }, 503);
  }

  if (!industry) {
    return json({ success: false, message: "Select a valid industry." }, 400);
  }

  const id = crypto.randomUUID();
  const storedName = safeFileName(originalName);

  if (!storedName || !storedName.includes(".")) {
    return json({ success: false, message: "Invalid upload filename." }, 400);
  }

  const fileKey = `datasets/${id}/${storedName}`;
  const now = Math.floor(Date.now() / 1000);

  try {
    await env.DATASETS_BUCKET.put(fileKey, fileBytes, {
      httpMetadata: {
        contentType: "application/octet-stream"
      },
      customMetadata: {
        datasetId: id,
        uploadedBy: data.admin.email
      }
    });

    await env.REGISTRATIONS.prepare(`
      INSERT INTO datasets (
        id,
        industry_id,
        title,
        slug,
        description,
        difficulty,
        file_key,
        file_name,
        file_format,
        file_size_bytes,
        record_count,
        column_count,
        learning_objectives,
        tags,
        status,
        created_at,
        updated_at,
        published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      industryId,
      title,
      slug,
      description,
      difficulty,
      fileKey,
      storedName,
      extension,
      file.size,
      recordCount,
      columnCount,
      JSON.stringify(objectives),
      JSON.stringify(tags),
      status,
      now,
      now,
      status === "published" ? now : null
    ).run();

    return json({
      success: true,
      message: status === "published"
        ? "Dataset uploaded and published."
        : "Dataset uploaded and saved as a draft.",
      dataset: {
        id,
        title,
        slug,
        status,
        file_name: storedName,
        file_size_bytes: file.size
      }
    }, 201);
  } catch (error) {
    console.error("Dataset upload failed:", error);

    try {
      await env.DATASETS_BUCKET.delete(fileKey);
    } catch (cleanupError) {
      console.error("Dataset file cleanup failed:", cleanupError);
    }

    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return json({ success: false, message: "That dataset URL slug is already in use. Choose another slug." }, 409);
    }

    return json({ success: false, message: "The dataset could not be saved. Please try again." }, 503);
  }
}
