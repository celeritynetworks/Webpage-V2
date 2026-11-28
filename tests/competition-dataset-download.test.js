import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestGet } from '../functions/api/competitions/[slug]/dataset.js';

const TOKEN = 'a'.repeat(43);
const DATASET = {
  competition_id: 'competition-1',
  dataset_file_key: 'competitions/competition-1/challenge.csv',
  dataset_file_name: 'challenge.csv',
  dataset_file_format: 'csv'
};

async function sessionHash(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function createEnv({ participant = DATASET, object = true } = {}) {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              calls.push({ sql, values });
              return participant;
            }
          };
        }
      };
    }
  };
  const bucket = {
    async get(key) {
      calls.push({ bucketKey: key });
      if (!object) return null;
      const content = 'id,value\n1,42\n';
      return {
        body: new Response(content).body,
        size: new TextEncoder().encode(content).byteLength,
        httpEtag: '"competition-dataset-etag"'
      };
    }
  };
  return { env: { REGISTRATIONS: db, DATASETS_BUCKET: bucket }, calls };
}

function request(slug = 'preview-challenge', token = TOKEN) {
  return new Request(`https://example.test/api/competitions/${slug}/dataset`, {
    headers: token ? { Cookie: `celerity_participant_session=${token}` } : {}
  });
}

test('requires a participant session before querying the database', async () => {
  const { env, calls } = createEnv();
  const response = await onRequestGet({ request: request('preview-challenge', ''), env, params: { slug: 'preview-challenge' } });
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test('denies access when the session is not registered and verified for this competition', async () => {
  const { env, calls } = createEnv({ participant: null });
  const response = await onRequestGet({ request: request(), env, params: { slug: 'preview-challenge' } });
  assert.equal(response.status, 403);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /p\.verified_at IS NOT NULL/i);
  assert.match(calls[0].sql, /p\.status = 'registered'/i);
  assert.match(calls[0].sql, /c\.slug = \?/i);
  assert.equal(calls[0].values[0], await sessionHash(TOKEN));
  assert.equal(calls[0].values[2], 'preview-challenge');
  assert.equal(calls.some(call => call.bucketKey), false);
});

test('rejects a storage key that does not belong to the registered competition', async () => {
  const { env, calls } = createEnv({
    participant: { ...DATASET, dataset_file_key: 'competitions/another-competition/challenge.csv' }
  });
  const response = await onRequestGet({ request: request(), env, params: { slug: 'preview-challenge' } });
  assert.equal(response.status, 404);
  assert.equal(calls.some(call => call.bucketKey), false);
});

test('serves the competition dataset to its verified participant with private download headers', async () => {
  const { env, calls } = createEnv();
  const response = await onRequestGet({ request: request(), env, params: { slug: 'preview-challenge' } });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'id,value\n1,42\n');
  assert.equal(response.headers.get('Content-Type'), 'text/csv; charset=utf-8');
  assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="challenge.csv"');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(response.headers.get('ETag'), '"competition-dataset-etag"');
  assert.equal(calls.at(-1).bucketKey, DATASET.dataset_file_key);
});

test('returns not found when the private competition object is missing', async () => {
  const { env } = createEnv({ object: false });
  const response = await onRequestGet({ request: request(), env, params: { slug: 'preview-challenge' } });
  assert.equal(response.status, 404);
});

test('rejects malformed competition slugs before reading participant data', async () => {
  const { env, calls } = createEnv();
  const response = await onRequestGet({ request: request('../private'), env, params: { slug: '../private' } });
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});
