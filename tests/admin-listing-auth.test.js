import test from 'node:test';
import assert from 'node:assert/strict';

import {
  onRequestGet as getCompetitions
} from '../functions/api/admin/competitions.js';

import {
  onRequestGet as getDatasets
} from '../functions/api/admin/datasets.js';

const admin = {
  admin: {
    email: 'reviewer@celeritynetworks.com.ng'
  }
};

function createMockDatabase() {
  const calls = [];

  const db = {
    prepare(sql) {
      return {
        async all() {
          calls.push(sql);
          return { results: [] };
        }
      };
    }
  };

  return { db, calls };
}

test('rejects unauthenticated competition listing without querying the database', async () => {
  const { db, calls } = createMockDatabase();

  const response = await getCompetitions({
    env: { REGISTRATIONS: db },
    data: {}
  });

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test('allows an authenticated administrator to list competitions', async () => {
  const { db, calls } = createMockDatabase();

  const response = await getCompetitions({
    env: { REGISTRATIONS: db },
    data: admin
  });

  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.success, true);
  assert.deepEqual(result.competitions, []);
  assert.equal(calls.length, 1);
});

test('rejects unauthenticated dataset listing without querying the database', async () => {
  const { db, calls } = createMockDatabase();

  const response = await getDatasets({
    env: { REGISTRATIONS: db },
    data: {}
  });

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test('allows an authenticated administrator to list datasets', async () => {
  const { db, calls } = createMockDatabase();

  const response = await getDatasets({
    env: { REGISTRATIONS: db },
    data: admin
  });

  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.success, true);
  assert.deepEqual(result.datasets, []);
  assert.equal(calls.length, 1);
});

test('normalizes malformed dataset objectives and tags when listing', async () => {
  const db = {
    prepare() {
      return {
        async all() {
          return {
            results: [{
              id: 'dataset-1',
              title: 'Test Dataset',
              learning_objectives: '{invalid-json',
              tags: '{"not":"an array"}'
            }]
          };
        }
      };
    }
  };

  const response = await getDatasets({
    env: { REGISTRATIONS: db },
    data: admin
  });

  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.success, true);
  assert.deepEqual(result.datasets[0].learning_objectives, []);
  assert.deepEqual(result.datasets[0].tags, []);
});

test('returns service unavailable when dataset listing database query fails', async () => {
  const db = {
    prepare() {
      return {
        async all() {
          throw new Error('Simulated database failure');
        }
      };
    }
  };

  const response = await getDatasets({
    env: { REGISTRATIONS: db },
    data: admin
  });

  const result = await response.json();

  assert.equal(response.status, 503);
  assert.equal(result.success, false);
  assert.equal(result.message, 'Unable to load datasets.');
});
