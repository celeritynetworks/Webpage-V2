import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestPost } from '../functions/api/register.js';

function createMockDatabase({
  rateLimitCount = 0,
  failRateLimit = false,
  failRegistration = false
} = {}) {
  const calls = [];

  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              calls.push({ type: 'run', sql, values });

              if (failRateLimit && /registration_rate_limits/.test(sql)) {
                throw new Error('Simulated rate-limit database failure');
              }

              if (failRegistration && /student_registrations/.test(sql)) {
                throw new Error('Simulated registration database failure');
              }

              const isAtomicRateLimitInsert =
                /INSERT INTO registration_rate_limits\s*\(ip_hash, created_at\)\s*SELECT/i.test(sql);

              return {
                meta: {
                  changes: isAtomicRateLimitInsert && rateLimitCount >= 5 ? 0 : 1
                }
              };
            },

            async first() {
              calls.push({ type: 'first', sql, values });
              return { total: rateLimitCount };
            }
          };
        }
      };
    }
  };

  return { db, calls };
}

function createRequest({
  body = {},
  ip = '203.0.113.10',
  origin = 'https://example.test',
  contentType = 'application/json'
} = {}) {
  return new Request('https://example.test/api/register', {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'Origin': origin,
      ...(ip ? { 'CF-Connecting-IP': ip } : {})
    },
    body: JSON.stringify({
      fullName: 'Test Participant',
      email: 'participant@example.com',
      phone: '+2348012345678',
      course: 'Data Analysis',
      mode: 'Virtual',
      education: 'University graduate',
      ...body
    })
  });
}

test('accepts a valid registration when rate limiting succeeds', async () => {
  const { db, calls } = createMockDatabase();

  const response = await onRequestPost({
    request: createRequest(),
    env: {
      REGISTRATIONS: db,
      RATE_LIMIT_SALT: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    }
  });

  const result = await response.json();

  assert.equal(response.status, 201);
  assert.equal(result.ok, true);
  assert.ok(result.registrationId);
  assert.ok(calls.some(call => /INSERT INTO student_registrations/.test(call.sql)));
  assert.ok(calls.some(call => /INSERT INTO registration_rate_limits[\s\S]*SELECT COUNT\(\*\)/.test(call.sql)));
});

test('rejects a sixth registration attempt within the rate-limit window', async () => {
  const { db, calls } = createMockDatabase({ rateLimitCount: 5 });

  const response = await onRequestPost({
    request: createRequest(),
    env: {
      REGISTRATIONS: db,
      RATE_LIMIT_SALT: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    }
  });

  assert.equal(response.status, 429);
  assert.equal(
    calls.some(call => /INSERT INTO student_registrations/.test(call.sql)),
    false
  );
});

test('rejects registration when the rate-limit salt is missing', async () => {
  const { db, calls } = createMockDatabase();

  const response = await onRequestPost({
    request: createRequest(),
    env: { REGISTRATIONS: db }
  });

  assert.equal(response.status, 503);
  assert.equal(
    calls.some(call => /INSERT INTO student_registrations/.test(call.sql)),
    false
  );
});

test('rejects registration when the client IP is missing', async () => {
  const { db, calls } = createMockDatabase();

  const response = await onRequestPost({
    request: createRequest({ ip: null }),
    env: {
      REGISTRATIONS: db,
      RATE_LIMIT_SALT: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    }
  });

  assert.equal(response.status, 503);
  assert.equal(
    calls.some(call => /INSERT INTO student_registrations/.test(call.sql)),
    false
  );
});

test('does not bypass rate limiting when its database operation fails', async () => {
  const { db, calls } = createMockDatabase({ failRateLimit: true });

  const response = await onRequestPost({
    request: createRequest(),
    env: {
      REGISTRATIONS: db,
      RATE_LIMIT_SALT: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    }
  });

  assert.equal(response.status, 503);
  assert.equal(
    calls.some(call => /INSERT INTO student_registrations/.test(call.sql)),
    false
  );
});

test('returns a service error when saving the registration fails', async () => {
  const { db } = createMockDatabase({ failRegistration: true });

  const response = await onRequestPost({
    request: createRequest(),
    env: {
      REGISTRATIONS: db,
      RATE_LIMIT_SALT: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    }
  });

  assert.equal(response.status, 503);
});

test('rejects invalid registration data before accessing the rate-limit table', async () => {
  const { db, calls } = createMockDatabase();

  const response = await onRequestPost({
    request: createRequest({
      body: { course: 'Unapproved Course' }
    }),
    env: {
      REGISTRATIONS: db,
      RATE_LIMIT_SALT: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    }
  });

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});



test('allows the same email to register more than once', async () => {
  const { db, calls } = createMockDatabase();

  const env = {
    REGISTRATIONS: db,
    RATE_LIMIT_SALT: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  };

  const firstResponse = await onRequestPost({
    request: createRequest({
      body: {
        email: 'same@example.com',
        course: 'Data Analysis'
      }
    }),
    env
  });

  const secondResponse = await onRequestPost({
    request: createRequest({
      body: {
        email: 'same@example.com',
        course: 'Digital Marketing'
      }
    }),
    env
  });

  const firstResult = await firstResponse.json();
  const secondResult = await secondResponse.json();

  assert.equal(firstResponse.status, 201);
  assert.equal(secondResponse.status, 201);
  assert.notEqual(firstResult.registrationId, secondResult.registrationId);

  const registrationInserts = calls.filter(
    call => /INSERT INTO student_registrations/.test(call.sql)
  );

  assert.equal(registrationInserts.length, 2);
  assert.equal(registrationInserts[0].values[2], 'same@example.com');
  assert.equal(registrationInserts[1].values[2], 'same@example.com');
});