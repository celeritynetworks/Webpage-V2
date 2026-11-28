import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestPost as registerParticipant } from '../functions/api/competitions/register.js';
import { onRequestPost as submitProject } from '../functions/api/competitions/participant/submit.js';

function createRegistrationDb() {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              calls.push({ type: 'run', sql, values });
              if (/INSERT INTO registration_rate_limits/i.test(sql)) {
                return { meta: { changes: 1 } };
              }
              if (/INSERT INTO competition_participants/i.test(sql)) {
                return { meta: { changes: 0 } };
              }
              return { meta: { changes: 1 } };
            },
            async first() {
              calls.push({ type: 'first', sql, values });
              if (/FROM competitions/i.test(sql)) {
                return {
                  id: 'competition-1',
                  title: 'Preview Challenge',
                  status: 'active',
                  registration_opens_at: null,
                  registration_closes_at: null
                };
              }
              return null;
            }
          };
        }
      };
    }
  };
  return { db, calls };
}

test('registration insert is rejected if the competition is archived after the initial lookup', async () => {
  const { db, calls } = createRegistrationDb();
  const request = new Request('https://example.test/api/competitions/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.20'
    },
    body: JSON.stringify({
      slug: 'preview-challenge',
      full_name: 'Test Participant',
      email: 'participant@example.com',
      phone: '+2348012345678'
    })
  });

  const response = await registerParticipant({
    request,
    env: {
      REGISTRATIONS: db,
      RESEND_API_KEY: 'test-key',
      RESEND_FROM_EMAIL: 'test@example.com',
      VERIFICATION_SECRET: 'test-secret'
    }
  });

  assert.equal(response.status, 409);
  const participantInsert = calls.find(call => /INSERT INTO competition_participants/i.test(call.sql));
  assert.ok(participantInsert);
  assert.match(participantInsert.sql, /WHERE EXISTS/i);
  assert.match(participantInsert.sql, /status IN \('upcoming', 'active'\)/i);
});

test('project submission insert is conditional on the competition remaining open', async () => {
  const calls = [];
  const participant = {
    id: 'participant-1',
    full_name: 'Test Participant',
    email: 'participant@example.com',
    participant_status: 'registered',
    verified_at: 100,
    competition_id: 'competition-1',
    competition_title: 'Preview Challenge',
    competition_status: 'active',
    starts_at: 1,
    ends_at: 4102444800
  };

  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              calls.push({ type: 'first', sql, values });
              if (/FROM competition_participant_sessions/i.test(sql)) return participant;
              if (/FROM competition_project_submissions/i.test(sql)) return null;
              return null;
            },
            async run() {
              calls.push({ type: 'run', sql, values });
              return { meta: { changes: 0 } };
            }
          };
        }
      };
    }
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    private: false,
    owner: { login: 'test-owner' },
    name: 'test-repository'
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  try {
    const token = 'a'.repeat(43);
    const request = new Request('https://example.test/api/competitions/participant/submit', {
      method: 'POST',
      headers: {
        'Origin': 'https://example.test',
        'Content-Type': 'application/json',
        'Cookie': `celerity_participant_session=${token}`
      },
      body: JSON.stringify({
        repository_url: 'https://github.com/test-owner/test-repository',
        ownership_confirmed: true,
        public_repository_confirmed: true
      })
    });

    const response = await submitProject({ request, env: { REGISTRATIONS: db } });
    assert.equal(response.status, 409);
    const submissionInsert = calls.find(call => /INSERT INTO competition_project_submissions/i.test(call.sql));
    assert.ok(submissionInsert);
    assert.match(submissionInsert.sql, /WHERE EXISTS/i);
    assert.match(submissionInsert.sql, /status IN \('upcoming', 'active'\)/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
