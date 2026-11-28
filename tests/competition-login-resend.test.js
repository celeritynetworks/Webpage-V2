
import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestPost as login } from '../functions/api/competitions/participant/login.js';
import { onRequestPost as resend } from '../functions/api/competitions/verification/resend.js';

const SECRET = 'test-verification-secret';
const PARTICIPANT_ID = 'participant-test-001';

function validBody(overrides = {}) {
  return {
    slug: 'test-competition',
    email: 'participant@example.com',
    ...overrides
  };
}

function makeRequest(body, options = {}) {
  const headers = new Headers();

  if (options.json !== false) {
    headers.set('Content-Type', 'application/json');
  }

  headers.set('CF-Connecting-IP', options.ip ?? '203.0.113.10');

  return new Request(
    'https://celeritynetworks.com.ng/api/test',
    {
      method: 'POST',
      headers,
      body: options.rawBody ?? JSON.stringify(body)
    }
  );
}

async function makeEnv(options = {}) {
  const calls = [];

  const participant = options.participant === undefined
    ? {
        id: PARTICIPANT_ID,
        full_name: 'Test <Participant>',
        verified_at: options.mode === 'login' ? 123456789 : null,
        status: 'registered',
        title: 'Test Competition'
      }
    : options.participant;

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
          calls.push({
            type: 'first',
            sql,
            values: this.values
          });

          if (options.participantError) {
            throw new Error('Mock participant lookup failure');
          }

          if (sql.includes('FROM competition_participants')) {
            return participant;
          }

          throw new Error('Unexpected first() query');
        },

        async run() {
          calls.push({
            type: 'run',
            sql,
            values: this.values
          });

          if (sql.includes('INSERT INTO competition_email_verifications')) {
            if (options.createError) {
              throw new Error('Mock pending verification failure');
            }

            return {
              meta: {
                changes: options.createChanges ?? 1
              }
            };
          }

          if (sql.includes('INSERT INTO registration_rate_limits')) {
            return {
              meta: {
                changes: options.rateLimitAllowed === false ? 0 : 1
              }
            };
          }

          if (sql.includes('DELETE FROM registration_rate_limits')) {
            return { meta: { changes: 0 } };
          }

          throw new Error('Unexpected run() query');
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

      if (options.activationError) {
        throw new Error('Mock activation transaction failure');
      }

      return options.activationResults ?? [
        { meta: { changes: 1 } },
        { meta: { changes: 1 } }
      ];
    }
  };

  return {
    calls,
    env: {
      REGISTRATIONS: options.missingDatabase ? null : db,
      RESEND_API_KEY: options.missingApiKey ? '' : 'test-api-key',
      RESEND_FROM_EMAIL: options.missingFromEmail ? '' : 'test@example.com',
      VERIFICATION_SECRET: options.missingSecret ? '' : SECRET
    }
  };
}

async function execute(handler, body, options = {}, t) {
  const { env, calls } = await makeEnv(options);

  let emailCalls = [];

  if (t) {
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      emailCalls.push({
        url,
        init,
        payload: JSON.parse(init.body)
      });

      if (options.emailThrows) {
        throw new Error('Mock email network failure');
      }

      return new Response(
        options.emailFails
          ? JSON.stringify({ message: 'Mock delivery failure' })
          : JSON.stringify({ id: 'mock-email-id' }),
        {
          status: options.emailFails ? 500 : 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    });
  }

  const response = await handler({
    request: makeRequest(body, options),
    env
  });

  return {
    response,
    data: await response.json(),
    calls,
    emailCalls
  };
}

const handlers = [
  { name: 'login', handler: login, mode: 'login' },
  { name: 'resend', handler: resend, mode: 'registration' }
];

for (const endpoint of handlers) {
  test(`${endpoint.name}: rejects missing database configuration`, async () => {
    const { response } = await execute(
      endpoint.handler,
      validBody(),
      { missingDatabase: true, mode: endpoint.mode }
    );

    assert.equal(response.status, 503);
  });

  test(`${endpoint.name}: rejects missing Resend API key`, async () => {
    const { response } = await execute(
      endpoint.handler,
      validBody(),
      { missingApiKey: true, mode: endpoint.mode }
    );

    assert.equal(response.status, 503);
  });

  test(`${endpoint.name}: rejects missing sender email configuration`, async () => {
    const { response } = await execute(
      endpoint.handler,
      validBody(),
      { missingFromEmail: true, mode: endpoint.mode }
    );

    assert.equal(response.status, 503);
  });

  test(`${endpoint.name}: rejects missing verification secret`, async () => {
    const { response } = await execute(
      endpoint.handler,
      validBody(),
      { missingSecret: true, mode: endpoint.mode }
    );

    assert.equal(response.status, 503);
  });

  test(`${endpoint.name}: rejects non-JSON requests`, async () => {
    const { response } = await execute(
      endpoint.handler,
      validBody(),
      { json: false, mode: endpoint.mode }
    );

    assert.equal(response.status, 415);
  });

  test(`${endpoint.name}: rejects malformed JSON`, async () => {
    const { response } = await execute(
      endpoint.handler,
      {},
      { rawBody: '{invalid json', mode: endpoint.mode }
    );

    assert.equal(response.status, 400);
  });

  test(`${endpoint.name}: rejects invalid competition slug`, async () => {
    const { response, calls } = await execute(
      endpoint.handler,
      validBody({ slug: '../invalid' }),
      { mode: endpoint.mode }
    );

    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
  });

  test(`${endpoint.name}: rejects invalid email address`, async () => {
    const { response, calls } = await execute(
      endpoint.handler,
      validBody({ email: 'invalid-email' }),
      { mode: endpoint.mode }
    );

    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
  });

  test(`${endpoint.name}: returns generic response when rate limited`, async () => {
    const { response, data, calls, emailCalls } = await execute(
      endpoint.handler,
      validBody(),
      {
        mode: endpoint.mode,
        rateLimitAllowed: false
      }
    );

    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(typeof data.message, 'string');
    assert.equal(emailCalls.length, 0);
    assert.equal(
      calls.some(call => call.type === 'first'),
      false
    );
  });

  test(`${endpoint.name}: returns generic response when participant does not exist`, async () => {
    const { response, data, emailCalls } = await execute(
      endpoint.handler,
      validBody(),
      {
        mode: endpoint.mode,
        participant: null
      }
    );

    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(emailCalls.length, 0);
  });

  test(`${endpoint.name}: does not disclose an ineligible participant`, async () => {
    const ineligibleParticipant = {
      id: PARTICIPANT_ID,
      full_name: 'Test Participant',
      verified_at: endpoint.mode === 'login' ? null : 123456789,
      status: 'registered',
      title: 'Test Competition'
    };

    const { response, data, emailCalls } = await execute(
      endpoint.handler,
      validBody(),
      {
        mode: endpoint.mode,
        participant: ineligibleParticipant
      }
    );

    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(emailCalls.length, 0);
  });

  test(`${endpoint.name}: returns generic response when rate-limit database operation fails`, async () => {
    const { response, data } = await execute(
      endpoint.handler,
      validBody(),
      {
        mode: endpoint.mode,
        missingDatabase: false
      }
    );

    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
  });

  test(`${endpoint.name}: does not send email if pending code creation fails`, async () => {
    const { response, data, emailCalls, calls } = await execute(
      endpoint.handler,
      validBody(),
      {
        mode: endpoint.mode,
        createChanges: 0
      },
      undefined
    );

    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(emailCalls.length, 0);
    assert.equal(calls.some(call => call.type === 'batch'), false);
  });

  test(`${endpoint.name}: does not activate code when email delivery fails`, async t => {
    const { response, data, emailCalls, calls } = await execute(
      endpoint.handler,
      validBody(),
      {
        mode: endpoint.mode,
        emailFails: true
      },
      t
    );

    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(emailCalls.length, 1);
    assert.equal(calls.some(call => call.type === 'batch'), false);
  });

  test(`${endpoint.name}: does not activate code when email network request fails`, async t => {
    const { response, data, emailCalls, calls } = await execute(
      endpoint.handler,
      validBody(),
      {
        mode: endpoint.mode,
        emailThrows: true
      },
      t
    );

    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(emailCalls.length, 1);
    assert.equal(calls.some(call => call.type === 'batch'), false);
  });

  test(`${endpoint.name}: activates code after successful email delivery`, async t => {
    const { response, data, emailCalls, calls } = await execute(
      endpoint.handler,
      validBody(),
      { mode: endpoint.mode },
      t
    );

    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(emailCalls.length, 1);

    const email = emailCalls[0];

    assert.equal(email.url, 'https://api.resend.com/emails');
    assert.equal(email.init.method, 'POST');
    assert.equal(email.init.headers.Authorization, 'Bearer test-api-key');
    assert.deepEqual(email.payload.to, ['participant@example.com']);

    const codeMatch = email.payload.text.match(/\b\d{6}\b/);

    assert.ok(codeMatch, 'Expected a six-digit code in the email');

    assert.match(email.payload.html, /&lt;Participant&gt;/);
    assert.doesNotMatch(email.payload.html, /<Participant>/);

    const pendingInsert = calls.find(call =>
      call.type === 'run' &&
      call.sql.includes('INSERT INTO competition_email_verifications')
    );

    assert.ok(pendingInsert, 'Expected pending verification insertion');

    assert.equal(
      pendingInsert.values.includes(PARTICIPANT_ID),
      true
    );

    const batch = calls.find(call => call.type === 'batch');

    assert.ok(batch, 'Expected activation transaction');
    assert.equal(batch.statements.length, 2);

    assert.match(
      batch.statements[0].sql,
      /SET consumed_at = NULL/
    );

    assert.match(
      batch.statements[1].sql,
      /SET consumed_at = \?/
    );
  });

  test(`${endpoint.name}: returns generic response when activation does not complete`, async t => {
    const { response, data, calls } = await execute(
      endpoint.handler,
      validBody(),
      {
        mode: endpoint.mode,
        activationResults: [
          { meta: { changes: 0 } },
          { meta: { changes: 0 } }
        ]
      },
      t
    );

    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(calls.some(call => call.type === 'batch'), true);
  });

  test(`${endpoint.name}: returns service error when participant lookup fails`, async () => {
    const { response, data } = await execute(
      endpoint.handler,
      validBody(),
      {
        mode: endpoint.mode,
        participantError: true
      }
    );

    assert.equal(response.status, 503);
    assert.match(data.error, /unable to process/i);
  });
}
