import test from 'node:test';
import assert from 'node:assert/strict';

import {
  onRequestGet
} from '../functions/api/datasets.js';

const SAMPLE_DATASETS = [
  {
    id: 'dataset-001',
    title: 'Agriculture Sample',
    slug: 'agriculture-sample',
    description: 'A sample agriculture dataset.',
    difficulty: 'Beginner',
    learning_objectives: '["Analyse trends","Build charts"]',
    tags: '["agriculture","analytics"]',
    industry_name: 'Agriculture',
    industry_slug: 'agriculture'
  },
  {
    id: 'dataset-002',
    title: 'Finance Sample',
    slug: 'finance-sample',
    description: 'A sample finance dataset.',
    difficulty: 'Intermediate',
    learning_objectives: 'invalid-json',
    tags: null,
    industry_name: 'Finance',
    industry_slug: 'finance'
  }
];

function createEnv(options = {}) {
  const calls = [];

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
            sql: this.sql,
            values: this.values
          });

          if (options.queryError) {
            throw new Error('Mock database failure');
          }

          return { total: options.total ?? SAMPLE_DATASETS.length };
        },

        async all() {
          calls.push({
            type: 'all',
            sql: this.sql,
            values: this.values
          });

          if (options.queryError) {
            throw new Error('Mock database failure');
          }

          return {
            results: options.results ?? SAMPLE_DATASETS
          };
        }
      };

      return statement;
    }
  };

  return {
    env: {
      REGISTRATIONS: options.missingDatabase ? null : db
    },
    calls
  };
}

async function callEndpoint(options = {}) {
  const { env, calls } = createEnv(options);

  const url = new URL(
    options.url ?? 'https://example.test/api/datasets'
  );

  const response = await onRequestGet({
    request: new Request(url),
    env
  });

  return { response, calls };
}

test('rejects a missing database binding', async () => {
  const { response, calls } = await callEndpoint({
    missingDatabase: true
  });

  assert.equal(response.status, 503);
  assert.equal(calls.length, 0);
});

test('returns only published datasets', async () => {
  const { response, calls } = await callEndpoint();

  assert.equal(response.status, 200);

  for (const call of calls) {
    assert.match(call.sql, /d\.status = 'published'/);
  }

  assert.equal(calls.length, 2);
});

test('applies industry, difficulty and search filters safely', async () => {
  const { response, calls } = await callEndpoint({
    url: 'https://example.test/api/datasets?industry=agriculture&difficulty=Beginner&q=watermelon'
  });

  assert.equal(response.status, 200);

  const countCall = calls.find(call => call.type === 'first');
  const listingCall = calls.find(call => call.type === 'all');

  assert.deepEqual(countCall.values, [
    'agriculture',
    'Beginner',
    '%watermelon%',
    '%watermelon%'
  ]);

  assert.deepEqual(listingCall.values, [
    'agriculture',
    'Beginner',
    '%watermelon%',
    '%watermelon%',
    12,
    0
  ]);

  assert.match(listingCall.sql, /i\.slug = \?/);
  assert.match(listingCall.sql, /d\.difficulty = \?/);
  assert.match(listingCall.sql, /d\.title LIKE \?/);
  assert.match(listingCall.sql, /d\.description LIKE \?/);
});

test('rejects an unsupported difficulty filter', async () => {
  const { response, calls } = await callEndpoint({
    url: 'https://example.test/api/datasets?difficulty=Expert'
  });

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('calculates pagination and applies the correct offset', async () => {
  const { response, calls } = await callEndpoint({
    url: 'https://example.test/api/datasets?page=2&limit=5',
    total: 11
  });

  const body = await response.json();
  const listingCall = calls.find(call => call.type === 'all');

  assert.equal(response.status, 200);

  assert.deepEqual(body.pagination, {
    page: 2,
    limit: 5,
    total: 11,
    totalPages: 3
  });

  assert.deepEqual(listingCall.values, [5, 5]);
});

test('caps page size at 30 and normalizes invalid page numbers', async () => {
  const { response, calls } = await callEndpoint({
    url: 'https://example.test/api/datasets?page=0&limit=100'
  });

  const body = await response.json();
  const listingCall = calls.find(call => call.type === 'all');

  assert.equal(response.status, 200);
  assert.equal(body.pagination.page, 1);
  assert.equal(body.pagination.limit, 30);

  assert.deepEqual(listingCall.values, [30, 0]);
});

test('normalizes learning objectives and tags into arrays', async () => {
  const { response } = await callEndpoint();

  const body = await response.json();

  assert.deepEqual(body.datasets[0].learning_objectives, [
    'Analyse trends',
    'Build charts'
  ]);

  assert.deepEqual(body.datasets[0].tags, [
    'agriculture',
    'analytics'
  ]);

  assert.deepEqual(body.datasets[1].learning_objectives, []);
  assert.deepEqual(body.datasets[1].tags, []);
});

test('returns an empty catalogue when no datasets are found', async () => {
  const { response } = await callEndpoint({
    results: [],
    total: 0
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.datasets, []);
  assert.equal(body.pagination.total, 0);
  assert.equal(body.pagination.totalPages, 0);
});

test('returns a controlled service error when the database query fails', async () => {
  const { response } = await callEndpoint({
    queryError: true
  });

  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error, 'Unable to load datasets at this time.');
});
