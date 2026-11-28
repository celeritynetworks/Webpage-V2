
const jwksCache = new Map();
const jwksRequests = new Map();

const JWKS_CACHE_MS = 5 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;
const MAX_TOKEN_LENGTH = 16384;

function errorResponse(status, message) {
  return new Response(JSON.stringify({
    success: false,
    message
  }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function normalizeTeamDomain(value) {
  const raw = String(value || "").trim();

  let url;

  try {
    url = new URL(
      raw.startsWith("https://") ? raw : `https://${raw}`
    );
  } catch {
    throw new Error("INVALID_CONFIGURATION");
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".cloudflareaccess.com") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.port
  ) {
    throw new Error("INVALID_CONFIGURATION");
  }

  return url.origin;
}

function decodeBase64Url(value) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new Error("INVALID_TOKEN");
  }

  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded = base64 +
    "=".repeat((4 - base64.length % 4) % 4);

  let binary;

  try {
    binary = atob(padded);
  } catch {
    throw new Error("INVALID_TOKEN");
  }

  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function decodeJsonSegment(segment) {
  try {
    const bytes = decodeBase64Url(segment);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("INVALID_TOKEN");
  }
}

async function getJwks(url, forceRefresh = false) {
  const now = Date.now();
  const cached = jwksCache.get(url);

  if (
    !forceRefresh &&
    cached &&
    now - cached.cachedAt < JWKS_CACHE_MS
  ) {
    return cached.keys;
  }

  if (!forceRefresh && jwksRequests.has(url)) {
    return jwksRequests.get(url);
  }

  const request = (async () => {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error("JWKS_UNAVAILABLE");
      }

      const data = await response.json();

      if (
        !data ||
        !Array.isArray(data.keys) ||
        data.keys.length === 0
      ) {
        throw new Error("JWKS_UNAVAILABLE");
      }

      const keys = data.keys;

      jwksCache.set(url, {
        keys,
        cachedAt: Date.now()
      });

      return keys;
    } catch {
      throw new Error("JWKS_UNAVAILABLE");
    }
  })();

  jwksRequests.set(url, request);

  try {
    return await request;
  } finally {
    if (jwksRequests.get(url) === request) {
      jwksRequests.delete(url);
    }
  }
}

async function verifyAccessToken(token, env) {
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > MAX_TOKEN_LENGTH
  ) {
    throw new Error("INVALID_TOKEN");
  }

  const teamDomain = normalizeTeamDomain(
    env.CLOUDFLARE_ACCESS_TEAM_DOMAIN
  );

  const audiences = String(
    env.CLOUDFLARE_ACCESS_AUD || ""
  ).split(",").map(value => value.trim()).filter(Boolean);

  const adminEmail = String(
    env.ADMIN_EMAIL || ""
  ).trim().toLowerCase();

  if (audiences.length === 0 || !adminEmail) {
    throw new Error("INVALID_CONFIGURATION");
  }

  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new Error("INVALID_TOKEN");
  }

  const header = decodeJsonSegment(parts[0]);

  if (
    !header ||
    header.alg !== "RS256" ||
    typeof header.kid !== "string" ||
    !header.kid
  ) {
    throw new Error("INVALID_TOKEN");
  }

  const jwksUrl = `${teamDomain}/cdn-cgi/access/certs`;

  let keys = await getJwks(jwksUrl);
  let jwk = keys.find(key => key.kid === header.kid);

  if (!jwk) {
    keys = await getJwks(jwksUrl, true);
    jwk = keys.find(key => key.kid === header.kid);
  }

  if (
    !jwk ||
    jwk.kty !== "RSA" ||
    (jwk.alg && jwk.alg !== "RS256") ||
    (jwk.use && jwk.use !== "sig") ||
    (
      Array.isArray(jwk.key_ops) &&
      !jwk.key_ops.includes("verify")
    )
  ) {
    throw new Error("INVALID_TOKEN");
  }

  let publicKey;

  try {
    publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256"
      },
      false,
      ["verify"]
    );
  } catch {
    throw new Error("INVALID_TOKEN");
  }

  const signature = decodeBase64Url(parts[2]);

  const signingInput = new TextEncoder().encode(
    `${parts[0]}.${parts[1]}`
  );

  let signatureValid;

  try {
    signatureValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      signature,
      signingInput
    );
  } catch {
    throw new Error("INVALID_TOKEN");
  }

  if (!signatureValid) {
    throw new Error("INVALID_TOKEN");
  }

  // Trust claims only after signature verification.
  const payload = decodeJsonSegment(parts[1]);
  const now = Math.floor(Date.now() / 1000);

  if (
    !payload ||
    payload.iss !== teamDomain ||
    !audiences.some(audience =>
      payload.aud === audience ||
      (Array.isArray(payload.aud) && payload.aud.includes(audience))
    ) ||
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= now - CLOCK_SKEW_SECONDS ||
    (
      Object.prototype.hasOwnProperty.call(payload, "nbf") &&
      (
        typeof payload.nbf !== "number" ||
        !Number.isFinite(payload.nbf) ||
        payload.nbf > now + CLOCK_SKEW_SECONDS
      )
    ) ||
    typeof payload.email !== "string" ||
    payload.email.trim().toLowerCase() !== adminEmail
  ) {
    throw new Error("INVALID_TOKEN");
  }

  return {
    email: payload.email.trim().toLowerCase(),
    subject: typeof payload.sub === "string"
      ? payload.sub
      : null
  };
}

export async function onRequest(context) {
  const token = context.request.headers.get(
    "cf-access-jwt-assertion"
  );

  if (!token) {
    return errorResponse(
      401,
      "Administrator authentication required."
    );
  }

  let admin;

  try {
    admin = await verifyAccessToken(
      token,
      context.env
    );
  } catch (error) {
    if (error.message === "JWKS_UNAVAILABLE") {
      return errorResponse(
        503,
        "Administrator authentication service temporarily unavailable."
      );
    }

    if (error.message === "INVALID_CONFIGURATION") {
      return errorResponse(
        503,
        "Administrator authentication is not configured correctly."
      );
    }

    return errorResponse(
      403,
      "Administrator access denied."
    );
  }

  context.data.admin = admin;

  return context.next();
}
