import test from 'node:test';
import assert from 'node:assert/strict';

let moduleCounter = 0;

const TEAM_A = 'https://team-a.cloudflareaccess.com';
const TEAM_B = 'https://team-b.cloudflareaccess.com';
const AUDIENCE = 'test-access-audience';
const ADMIN_EMAIL = 'admin@example.com';

async function createKeyPair() {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['sign', 'verify']
  );

  const jwk = await crypto.subtle.exportKey(
    'jwk',
    pair.publicKey
  );

  return {
    privateKey: pair.privateKey,
    jwk: {
      ...jwk,
      kid: 'test-key',
      alg: 'RS256',
      use: 'sig',
      key_ops: ['verify']
    }
  };
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function createToken(keyPair, claims = {}, team = TEAM_A) {
  const header = encode({
    alg: 'RS256',
    typ: 'JWT',
    kid: 'test-key'
  });

  const now = Math.floor(Date.now() / 1000);

  const payload = encode({
    iss: team,
    aud: AUDIENCE,
    exp: now + 300,
    iat: now,
    email: ADMIN_EMAIL,
    sub: 'test-admin',
    ...claims
  });

  const signingInput = `${header}.${payload}`;

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyPair.privateKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${Buffer.from(signature).toString('base64url')}`;
}

async function loadMiddleware(t, fetchHandler) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = fetchHandler;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  return import(
    `../functions/api/admin/_middleware.js?test=${++moduleCounter}`
  );
}

async function invoke(
  middleware,
  token,
  team = TEAM_A,
  nextHandler = async () => new Response('accepted', { status: 200 }),
  audience = AUDIENCE
) {
  const headers = {};

  if (token !== null) {
    headers['cf-access-jwt-assertion'] = token;
  }

  const context = {
    request: new Request('https://example.test/api/admin/me', {
      headers
    }),
    env: {
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: team,
      CLOUDFLARE_ACCESS_AUD: audience,
      ADMIN_EMAIL
    },
    data: {},
    next: nextHandler
  };

  const response = await middleware.onRequest(context);

  return {
    response,
    admin: context.data.admin
  };
}

function jwksResponse(jwk) {
  return new Response(JSON.stringify({ keys: [jwk] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

test('accepts a valid Cloudflare Access administrator token', async t => {
  const keyPair = await createKeyPair();

  const middleware = await loadMiddleware(
    t,
    async () => jwksResponse(keyPair.jwk)
  );

  const token = await createToken(keyPair);
  const result = await invoke(middleware, token);

  assert.equal(result.response.status, 200);
  assert.equal(result.admin.email, ADMIN_EMAIL);
  assert.equal(result.admin.subject, 'test-admin');
});

test('accepts a token from either configured admin path audience', async t => {
  const keyPair = await createKeyPair();
  const middleware = await loadMiddleware(t, async () => jwksResponse(keyPair.jwk));
  const token = await createToken(keyPair, { aud: 'admin-api-audience' });
  const result = await invoke(middleware, token, TEAM_A, undefined, `${AUDIENCE},admin-api-audience`);
  assert.equal(result.response.status, 200);
});

test('rejects a request without an Access token', async t => {
  let fetchCalls = 0;

  const middleware = await loadMiddleware(t, async () => {
    fetchCalls++;
    return new Response('{}');
  });

  const result = await invoke(middleware, null);

  assert.equal(result.response.status, 401);
  assert.equal(fetchCalls, 0);
});

test('rejects a malformed token', async t => {
  const keyPair = await createKeyPair();

  const middleware = await loadMiddleware(
    t,
    async () => jwksResponse(keyPair.jwk)
  );

  const result = await invoke(middleware, 'not-a-valid-jwt');

  assert.equal(result.response.status, 403);
});

test('rejects a token with an invalid signature', async t => {
  const trustedKey = await createKeyPair();
  const attackerKey = await createKeyPair();

  const middleware = await loadMiddleware(
    t,
    async () => jwksResponse(trustedKey.jwk)
  );

  const token = await createToken(attackerKey);
  const result = await invoke(middleware, token);

  assert.equal(result.response.status, 403);
});

test('rejects a token with the wrong issuer', async t => {
  const keyPair = await createKeyPair();

  const middleware = await loadMiddleware(
    t,
    async () => jwksResponse(keyPair.jwk)
  );

  const token = await createToken(keyPair, {
    iss: 'https://attacker.cloudflareaccess.com'
  });

  const result = await invoke(middleware, token);

  assert.equal(result.response.status, 403);
});

test('rejects a token with the wrong audience', async t => {
  const keyPair = await createKeyPair();

  const middleware = await loadMiddleware(
    t,
    async () => jwksResponse(keyPair.jwk)
  );

  const token = await createToken(keyPair, {
    aud: 'wrong-audience'
  });

  const result = await invoke(middleware, token);

  assert.equal(result.response.status, 403);
});

test('rejects an expired token', async t => {
  const keyPair = await createKeyPair();

  const middleware = await loadMiddleware(
    t,
    async () => jwksResponse(keyPair.jwk)
  );

  const token = await createToken(keyPair, {
    exp: Math.floor(Date.now() / 1000) - 600
  });

  const result = await invoke(middleware, token);

  assert.equal(result.response.status, 403);
});

test('rejects a token for a different administrator email', async t => {
  const keyPair = await createKeyPair();

  const middleware = await loadMiddleware(
    t,
    async () => jwksResponse(keyPair.jwk)
  );

  const token = await createToken(keyPair, {
    email: 'unauthorized@example.com'
  });

  const result = await invoke(middleware, token);

  assert.equal(result.response.status, 403);
});

test('returns 503 when the Cloudflare JWKS service is unavailable', async t => {
  const middleware = await loadMiddleware(t, async () => {
    return new Response('Unavailable', { status: 503 });
  });

  const keyPair = await createKeyPair();
  const token = await createToken(keyPair);
  const result = await invoke(middleware, token);

  assert.equal(result.response.status, 503);
});

test('does not reuse signing keys across different Cloudflare teams', async t => {
  const keyA = await createKeyPair();
  const keyB = await createKeyPair();

  let fetchCalls = 0;

  const middleware = await loadMiddleware(t, async url => {
    fetchCalls++;

    if (String(url).startsWith(TEAM_A)) {
      return jwksResponse(keyA.jwk);
    }

    if (String(url).startsWith(TEAM_B)) {
      return jwksResponse(keyB.jwk);
    }

    return new Response('Not found', { status: 404 });
  });

  const tokenA = await createToken(keyA, {}, TEAM_A);
  const resultA = await invoke(middleware, tokenA, TEAM_A);

  assert.equal(resultA.response.status, 200);

  // This token claims to come from Team B but is signed with Team A's key.
  const tokenB = await createToken(keyA, {}, TEAM_B);
  const resultB = await invoke(middleware, tokenB, TEAM_B);

  assert.equal(resultB.response.status, 403);
  assert.equal(fetchCalls, 2);
});

test('does not convert downstream API errors into authentication errors', async t => {
  const keyPair = await createKeyPair();

  const middleware = await loadMiddleware(
    t,
    async () => jwksResponse(keyPair.jwk)
  );

  const token = await createToken(keyPair);
  const downstreamError = new Error('Simulated database failure');

  await assert.rejects(
    () => invoke(
      middleware,
      token,
      TEAM_A,
      async () => {
        throw downstreamError;
      }
    ),
    error => error === downstreamError
  );
});
