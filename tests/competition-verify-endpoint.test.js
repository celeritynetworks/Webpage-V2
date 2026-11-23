
import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestPost } from '../functions/api/competitions/verification/verify.js';
import { hashVerificationCode } from '../functions/_shared/competition-verification.js';

const SECRET = 'test-verification-secret';
const PARTICIPANT_ID = 'participant-test-001';
const VERIFICATION_ID = 'verification-test-001';
const CODE = '123456';

async function makeEnv(options = {}) {
  const now = Math.floor(Date.now() / 1000);

  const participant = options.participant === undefined
    ? { id: PARTICIPANT_ID, verified_at: null }
    : options.participant;

  const verification = options.verification === undefined
    ? {
        id: VERIFICATION_ID,
        code_hash: await hashVerificationCode(
          SECRET,
          PARTICIPANT_ID,
          CODE
        ),
        expires_at: now + 600,
        attempts: 0
      }
    : options.verification;

  const calls = [];
  const batchResults = options.batchResults || [
    { meta: { changes: 1 } },
    { meta: { changes: 1 } },
    { meta: { changes: 1 } }
  ];

  const db = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],

        bind(...values) {
          this.values = values;
          return this;
        },

        async first() {
          calls.push({ type: 'first', sql, values: this.values });

          if (sql.includes('FROM competition_participants')) {
            if (options.participantError) {
              throw new Error('Mock participant query failure');
            }

            return participant;
          }

          if (sql.includes('FROM competition_email_verifications')) {
            if (options.verificationError) {
              throw new Error('Mock verification query failure');
            }

            return verification;
          }

          throw new Error('Unexpected first() query');
        },

        async run() {
          calls.push({ type: 'run', sql, values: this.values });

          if (options.runError) {
            throw new Error('Mock database update failure');
          }

          return { meta: { changes: options.runChanges ?? 1 } };
        }
      };

      return statement;
    },

    async batch(statements) {
      calls.push({
        type: 'batch',
        statements: statements.map(statement => ({
          sql: statement.sql,
          values: statement.values
        }))
      });

      if (options.batchError) {
        throw new Error('Mock transaction failure');
      }

      return batchResults;
    }
  };

  return {
    env: {
      REGISTRATIONS: options.missingDatabase ? null : db,
      VERIFICATION_SECRET: options.missingSecret ? '' : SECRET
    },
    calls
  };
}

function makeRequest(body, options = {}) {
  const headers = new Headers();

  if (options.json !== false) {
    headers.set('Content-Type', 'application/json');
  }

  return new Request(
    options.url || 'https://celeritynetworks.com.ng/api/competitions/verification/verify',
    {
      method: 'POST',
      headers,
      body: options.rawBody ?? JSON.stringify(body)
    }
  );
}

async function callEndpoint(body, options = {}) {
  const { env, calls } = await makeEnv(options);

  const response = await onRequestPost({
    request: makeRequest(body, options),
    env
  });

  const data = await response.json();

  return { response, data, calls };
}

function validBody(overrides = {}) {
  return {
    slug: 'test-competition',
    email: 'participant@example.com',
    code: CODE,
    ...overrides
  };
}

test('rejects missing database binding', async () => {
  const { response, data } = await callEndpoint(validBody(), {
    missingDatabase: true
  });

  assert.equal(response.status, 503);
  assert.match(data.error, /temporarily unavailable/i);
});

test('rejects missing verification secret', async () => {
  const { response } = await callEndpoint(validBody(), {
    missingSecret: true
  });

  assert.equal(response.status, 503);
});

test('rejects non-JSON requests', async () => {
  const { response } = await callEndpoint(validBody(), {
    json: false
  });

  assert.equal(response.status, 415);
});

test('rejects malformed JSON', async () => {
  const { response } = await callEndpoint({}, {
    rawBody: '{invalid json'
  });

  assert.equal(response.status, 400);
});

test('rejects invalid competition slug', async () => {
  const { response, calls } = await callEndpoint(
    validBody({ slug: '../invalid' })
  );

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('rejects invalid email address', async () => {
  const { response, calls } = await callEndpoint(
    validBody({ email: 'invalid-email' })
  );

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('rejects codes that are not six digits', async () => {
  const { response, calls } = await callEndpoint(
    validBody({ code: '12345' })
  );

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('rejects when participant does not exist', async () => {
  const { response, data } = await callEndpoint(validBody(), {
    participant: null
  });

  assert.equal(response.status, 400);
  assert.match(data.error, /invalid or expired/i);
});

test('rejects participants whose email is already verified', async () => {
  const { response, data } = await callEndpoint(validBody(), {
    participant: {
      id: PARTICIPANT_ID,
      verified_at: 123456789
    }
  });

  assert.equal(response.status, 409);
  assert.match(data.error, /already been verified/i);
});

test('rejects when no active verification code exists', async () => {
  const { response, data } = await callEndpoint(validBody(), {
    verification: null
  });

  assert.equal(response.status, 400);
  assert.match(data.error, /unavailable/i);
});

test('rejects a verification code after five failed attempts', async () => {
  const now = Math.floor(Date.now() / 1000);

  const { response, data, calls } = await callEndpoint(validBody(), {
    verification: {
      id: VERIFICATION_ID,
      code_hash: 'invalid-hash',
      expires_at: now + 600,
      attempts: 5
    }
  });

  assert.equal(response.status, 400);
  assert.match(data.error, /unavailable/i);
  assert.equal(calls.some(call => call.type === 'batch'), false);
});

test('rejects expired verification codes', async () => {
  const now = Math.floor(Date.now() / 1000);

  const { response, data, calls } = await callEndpoint(validBody(), {
    verification: {
      id: VERIFICATION_ID,
      code_hash: 'invalid-hash',
      expires_at: now - 10,
      attempts: 0
    }
  });

  assert.equal(response.status, 400);
  assert.match(data.error, /expired/i);
  assert.equal(calls.some(call => call.type === 'batch'), false);
});

test('increments failed attempts when an incorrect code is submitted', async () => {
  const { response, data, calls } = await callEndpoint(
    validBody({ code: '999999' })
  );

  assert.equal(response.status, 400);
  assert.match(data.error, /incorrect verification code/i);

  const update = calls.find(call =>
    call.type === 'run' &&
    call.sql.includes('SET attempts = attempts + 1')
  );

  assert.ok(update, 'Expected failed attempt counter update');
  assert.deepEqual(update.values, [
    VERIFICATION_ID,
    assert.anything,
    PARTICIPANT_ID
  ].map((value, index) => index === 1 ? update.values[1] : value));

  assert.equal(update.values[0], VERIFICATION_ID);
  assert.equal(update.values[2], PARTICIPANT_ID);
  assert.equal(typeof update.values[1], 'number');

  assert.equal(calls.some(call => call.type === 'batch'), false);
});

test('does not create a session when failed-attempt update fails', async () => {
  const { response } = await callEndpoint(
    validBody({ code: '999999' }),
    { runError: true }
  );

  assert.equal(response.status, 503);
});

test('successfully verifies participant and creates a session', async () => {
  const { response, data, calls } = await callEndpoint(validBody());

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.verified, true);

  const cookie = response.headers.get('Set-Cookie');

  assert.ok(cookie);
  assert.match(cookie, /^celerity_participant_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=604800/);

  const batch = calls.find(call => call.type === 'batch');

  assert.ok(batch);
  assert.equal(batch.statements.length, 3);

  assert.match(batch.statements[0].sql, /INSERT INTO competition_participant_sessions/);
  assert.match(batch.statements[1].sql, /SET consumed_at/);
  assert.match(batch.statements[2].sql, /SET verified_at/);

  assert.equal(batch.statements[0].values[3], PARTICIPANT_ID);
  assert.equal(batch.statements[0].values[4], VERIFICATION_ID);
});

test('rejects verification when the transaction does not complete all three operations', async () => {
  const { response, data, calls } = await callEndpoint(validBody(), {
    batchResults: [
      { meta: { changes: 1 } },
      { meta: { changes: 1 } },
      { meta: { changes: 0 } }
    ]
  });

  assert.equal(response.status, 400);
  assert.match(data.error, /no longer valid/i);

  const cleanup = calls.find(call =>
    call.type === 'run' &&
    call.sql.includes('DELETE FROM competition_participant_sessions')
  );

  assert.ok(cleanup, 'Expected unsuccessful session cleanup');
  assert.equal(cleanup.values[1], PARTICIPANT_ID);
});

test('returns a service error when the transaction throws', async () => {
  const { response, data, calls } = await callEndpoint(validBody(), {
    batchError: true
  });

  assert.equal(response.status, 503);
  assert.match(data.error, /unable to verify/i);

  assert.equal(
    calls.some(call =>
      call.type === 'run' &&
      call.sql.includes('DELETE FROM competition_participant_sessions')
    ),
    false
  );
});

test('returns a service error when participant lookup fails', async () => {
  const { response } = await callEndpoint(validBody(), {
    participantError: true
  });

  assert.equal(response.status, 503);
});

test('returns a service error when verification lookup fails', async () => {
  const { response } = await callEndpoint(validBody(), {
    verificationError: true
  });

  assert.equal(response.status, 503);
});

test('does not issue a session cookie when verification fails', async () => {
  const { response } = await callEndpoint(
    validBody({ code: '999999' })
  );

  assert.equal(response.headers.get('Set-Cookie'), null);
});
