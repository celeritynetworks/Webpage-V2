export function adminJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export function validAdminOrigin(request) {
  const origin = request.headers.get("Origin");
  const requestUrl = new URL(request.url);
  const fetchSite = request.headers.get("Sec-Fetch-Site");

  return Boolean(
    origin &&
    origin === requestUrl.origin &&
    (!fetchSite || fetchSite === "same-origin")
  );
}

export async function readDeletionRequest(request) {
  if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    return { error: adminJson({ success: false, message: "Use application/json for this request." }, 415) };
  }

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > 4096) {
    return { error: adminJson({ success: false, message: "Request body is too large." }, 413) };
  }

  let body;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 4096) {
      return { error: adminJson({ success: false, message: "Request body is too large." }, 413) };
    }
    body = JSON.parse(rawBody);
  } catch {
    return { error: adminJson({ success: false, message: "Invalid request body." }, 400) };
  }

  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const confirmName = typeof body?.confirmName === "string" ? body.confirmName.trim() : "";

  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
    return { error: adminJson({ success: false, message: "A valid resource ID is required." }, 400) };
  }

  if (reason.length < 10 || reason.length > 1000) {
    return { error: adminJson({ success: false, message: "Provide an audit reason between 10 and 1,000 characters." }, 400) };
  }

  return { id, reason, confirmName };
}

export async function writeResourceAudit(db, {
  resourceType,
  resourceId,
  resourceName,
  action,
  reason,
  adminEmail
}) {
  await db.prepare(`
    INSERT INTO admin_resource_audit (
      id, resource_type, resource_id, resource_name,
      action, reason, admin_email, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    resourceType,
    resourceId,
    resourceName,
    action,
    reason,
    adminEmail,
    Math.floor(Date.now() / 1000)
  ).run();
}
