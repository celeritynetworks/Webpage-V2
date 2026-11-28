
import test from 'node:test';
import assert from 'node:assert/strict';

import { enforceCompetitionRateLimit } from '../functions/_shared/competition-rate-limit.js';

function createMockDatabase({ changes = 1, shouldThrow = false } = {}) {
  const calls = [];

  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              calls.push({ sql, values });

              if (shouldThrow) {
                throw new Error('Mock database failure');
              }

              return { meta: { changes } };
            }
          };
        }
      };
    }
  };

  return { db, calls };
}

function createRequest(ip = '203.0.113.10') {
  return new Request('https://example.test/api/competitions/participant/login', {
    method: 'POST',
    headers: {
      'CF-Connecting-IP': ip
    }
  });
}

test('allows a request when the database reserves a rate-limit slot', async () => {
  const { db, calls } = createMockDatabase({ changes: 1 });

  const result = await enforceCompetitionRateLimit(
    createRequest(),
    {
      REGISTRATIONS: db,
      VERIFICATION_SECRET: 'test-secret'
    }
  );

  assert.equal(result, true);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /DELETE FROM registration_rate_limits/);
  assert.match(calls[1].sql, /INSERT INTO registration_rate_limits/);
  assert.match(calls[1].sql, /COUNT\(\*\)/);
});

test('blocks a request when the five-request limit has been reached', async () => {
  const { db } = createMockDatabase({ changes: 0 });

  const result = await enforceCompetitionRateLimit(
    createRequest(),
    {
      REGISTRATIONS: db,
      VERIFICATION_SECRET: 'test-secret'
    }
  );

  assert.equal(result, false);
});

test('rejects requests when the database binding is missing', async () => {
  await assert.rejects(
    () => enforceCompetitionRateLimit(
      createRequest(),
      { VERIFICATION_SECRET: 'test-secret' }
    ),
    /configuration is missing/
  );
});

test('rejects requests when the verification secret is missing', async () => {
  const { db } = createMockDatabase();

  await assert.rejects(
    () => enforceCompetitionRateLimit(
      createRequest(),
      { REGISTRATIONS: db }
    ),
    /configuration is missing/
  );
});

test('rejects requests when the client IP is missing', async () => {
  const { db } = createMockDatabase();

  await assert.rejects(
    () => enforceCompetitionRateLimit(
      new Request('https://example.test/api/test', { method: 'POST' }),
      {
        REGISTRATIONS: db,
        VERIFICATION_SECRET: 'test-secret'
      }
    ),
    /Unable to establish the request IP address/
  );
});

test('rejects requests when the client IP is too long', async () => {
  const { db } = createMockDatabase();

  await assert.rejects(
    () => enforceCompetitionRateLimit(
      createRequest('a'.repeat(101)),
      {
        REGISTRATIONS: db,
        VERIFICATION_SECRET: 'test-secret'
      }
    ),
    /Unable to establish the request IP address/
  );
});

test('does not bypass rate limiting when the database fails', async () => {
  const { db } = createMockDatabase({ shouldThrow: true });

  await assert.rejects(
    () => enforceCompetitionRateLimit(
      createRequest(),
      {
        REGISTRATIONS: db,
        VERIFICATION_SECRET: 'test-secret'
      }
    ),
    /Mock database failure/
  );
});
