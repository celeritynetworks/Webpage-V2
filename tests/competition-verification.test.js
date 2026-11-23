
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isJsonRequest,
  readJsonBody,
  generateVerificationCode,
  hashVerificationCode,
  createPendingVerification,
  activatePendingVerification
} from '../functions/_shared/competition-verification.js';

function createRequest(body, contentType = 'application/json') {
  return new Request('https://example.test/api/test', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body
  });
}

function createMockDatabase({
  runChanges = 1,
  batchResults = [
    { meta: { changes: 1 } },
    { meta: { changes: 1 } }
  ]
} = {}) {
  const calls = [];

  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            sql,
            values,
            async run() {
              calls.push({ type: 'run', sql, values });
              return { meta: { changes: runChanges } };
            }
          };
        }
      };
    },

    async batch(statements) {
      calls.push({ type: 'batch', statements });
      return batchResults;
    }
  };

  return { db, calls };
}

test('accepts application/json content types with parameters', () => {
  assert.equal(
    isJsonRequest(createRequest('{}', 'application/json; charset=utf-8')),
    true
  );
});

test('rejects non-JSON content types', () => {
  assert.equal(
    isJsonRequest(createRequest('{}', 'text/plain')),
    false
  );
});

test('reads a valid JSON object', async () => {
  const result = await readJsonBody(createRequest(
    JSON.stringify({ email: 'participant@example.com' })
  ));

  assert.deepEqual(result, {
    body: { email: 'participant@example.com' }
  });
});

test('rejects invalid JSON', async () => {
  const result = await readJsonBody(createRequest('{invalid json'));

  assert.deepEqual(result, { error: 'invalid' });
});

test('rejects JSON arrays and primitive values', async () => {
  for (const value of ['[]', 'null', '123', '"text"', 'true']) {
    const result = await readJsonBody(createRequest(value));
    assert.deepEqual(result, { error: 'invalid' });
  }
});

test('rejects a declared body larger than 12 KB', async () => {
  const result = await readJsonBody(
    new Request('https://example.test/api/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(12 * 1024 + 1)
      },
      body: '{}'
    })
  );

  assert.deepEqual(result, { error: 'too_large' });
});

test('generates six-digit verification codes, including leading zeroes', () => {
  for (let i = 0; i < 100; i++) {
    const code = generateVerificationCode();

    assert.match(code, /^\d{6}$/);
  }
});

test('creates a consistent HMAC hash for the same inputs', async () => {
  const first = await hashVerificationCode(
    'test-secret',
    'participant-123',
    '012345'
  );

  const second = await hashVerificationCode(
    'test-secret',
    'participant-123',
    '012345'
  );

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('produces different hashes when the code or participant changes', async () => {
  const original = await hashVerificationCode(
    'test-secret',
    'participant-123',
    '012345'
  );

  const differentCode = await hashVerificationCode(
    'test-secret',
    'participant-123',
    '012346'
  );

  const differentParticipant = await hashVerificationCode(
    'test-secret',
    'participant-456',
    '012345'
  );

  assert.notEqual(original, differentCode);
  assert.notEqual(original, differentParticipant);
});

test('creates a pending registration verification record', async () => {
  const { db, calls } = createMockDatabase();

  const result = await createPendingVerification(
    { REGISTRATIONS: db },
    {
      id: 'verification-1',
      participantId: 'participant-1',
      codeHash: 'a'.repeat(64),
      now: 100000,
      mode: 'registration'
    }
  );

  assert.equal(result, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO competition_email_verifications/);
  assert.match(calls[0].sql, /COUNT\(\*\)/);
  assert.match(calls[0].sql, /NOT EXISTS/);
  assert.equal(calls[0].values[2], 100600);
  assert.equal(calls[0].values[3], 100000);
  assert.equal(calls[0].values[4], 100000);
  assert.equal(calls[0].values[6], 0);
  assert.equal(calls[0].values[7], 0);
  assert.equal(calls[0].values[8], 96400);
  assert.equal(calls[0].values[9], 5);
  assert.equal(calls[0].values[10], 99940);
});

test('rejects an invalid verification mode when creating a pending record', async () => {
  const { db, calls } = createMockDatabase();

  await assert.rejects(
    () => createPendingVerification(
      { REGISTRATIONS: db },
      {
        id: 'verification-1',
        participantId: 'participant-1',
        codeHash: 'a'.repeat(64),
        now: 100000,
        mode: 'invalid'
      }
    ),
    /Invalid verification mode/
  );

  assert.equal(calls.length, 0);
});

test('returns false when the database does not create a pending record', async () => {
  const { db } = createMockDatabase({ runChanges: 0 });

  const result = await createPendingVerification(
    { REGISTRATIONS: db },
    {
      id: 'verification-1',
      participantId: 'participant-1',
      codeHash: 'a'.repeat(64),
      now: 100000,
      mode: 'login'
    }
  );

  assert.equal(result, false);
});

test('activates a pending code and invalidates previous active codes in one batch', async () => {
  const { db, calls } = createMockDatabase();

  const result = await activatePendingVerification(
    { REGISTRATIONS: db },
    {
      id: 'verification-2',
      participantId: 'participant-1',
      pendingAt: 100000,
      now: 100010,
      mode: 'login'
    }
  );

  assert.equal(result, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'batch');
  assert.equal(calls[0].statements.length, 2);

  assert.match(calls[0].statements[0].sql, /SET consumed_at = NULL/);
  assert.match(calls[0].statements[1].sql, /SET consumed_at = \?/);
  assert.match(calls[0].statements[0].sql, /expires_at >= \?/);
  assert.match(calls[0].statements[1].sql, /pending\.consumed_at IS NULL/);
});

test('does not report activation success when the pending record was not activated', async () => {
  const { db } = createMockDatabase({
    batchResults: [
      { meta: { changes: 0 } },
      { meta: { changes: 0 } }
    ]
  });

  const result = await activatePendingVerification(
    { REGISTRATIONS: db },
    {
      id: 'verification-2',
      participantId: 'participant-1',
      pendingAt: 100000,
      now: 100010,
      mode: 'login'
    }
  );

  assert.equal(result, false);
});

test('rejects an invalid verification mode during activation', async () => {
  const { db, calls } = createMockDatabase();

  await assert.rejects(
    () => activatePendingVerification(
      { REGISTRATIONS: db },
      {
        id: 'verification-2',
        participantId: 'participant-1',
        pendingAt: 100000,
        now: 100010,
        mode: 'invalid'
      }
    ),
    /Invalid verification mode/
  );

  assert.equal(calls.length, 0);
});
