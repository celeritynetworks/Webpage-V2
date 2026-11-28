import test from 'node:test';
import assert from 'node:assert/strict';

import {
  onRequestGet
} from '../functions/api/datasets/[slug]/download.js';

const DATASET = {
  id: 'dataset-test-001',
  file_key: 'datasets/dataset-test-001/sample.csv',
  file_name: 'sample.csv',
  file_format: 'csv'
};

const CSV_CONTENT = 'id,name\n1,Ada\n';

function createEnv(options = {}) {
  const calls = [];

  const dataset = options.dataset === undefined
    ? DATASET
    : options.dataset;

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

          if (options.queryError) {
            throw new Error('Mock database query failure');
          }

          return dataset;
        },

        async run() {
          calls.push({
            type: 'run',
            sql,
            values: this.values
          });

          if (options.counterError) {
            throw new Error('Mock counter update failure');
          }

          return { meta: { changes: 1 } };
        }
      };

      return statement;
    }
  };

  const object = options.object === undefined
    ? {
        body: new Response(CSV_CONTENT).body,
        size: new TextEncoder().encode(CSV_CONTENT).length,
        writeHttpMetadata(headers) {
          headers.set('ETag', '"test-etag"');
        }
      }
    : options.object;

  const bucket = {
    async get(key) {
      calls.push({
        type: 'get',
        key
      });

      if (options.bucketError) {
        throw new Error('Mock R2 retrieval failure');
      }

      return object;
    }
  };

  return {
    env: {
      REGISTRATIONS: options.missingDatabase ? null : db,
      DATASETS_BUCKET: options.missingBucket ? null : bucket
    },
    calls
  };
}

async function callEndpoint(options = {}) {
  const { env, calls } = createEnv(options);

  const response = await onRequestGet({
    params: {
      slug: options.slug ?? 'sample-dataset'
    },
    env
  });

  return { response, calls };
}

test('rejects missing database binding', async () => {
  const { response, calls } = await callEndpoint({
    missingDatabase: true
  });

  assert.equal(response.status, 503);
  assert.equal(calls.length, 0);
});

test('rejects missing R2 bucket binding', async () => {
  const { response, calls } = await callEndpoint({
    missingBucket: true
  });

  assert.equal(response.status, 503);
  assert.equal(calls.length, 0);
});

test('rejects invalid dataset slug without querying the database', async () => {
  const { response, calls } = await callEndpoint({
    slug: '../invalid'
  });

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('returns 404 when the published dataset does not exist', async () => {
  const { response, calls } = await callEndpoint({
    dataset: null
  });

  assert.equal(response.status, 404);
  assert.equal(calls.filter(call => call.type === 'first').length, 1);
  assert.equal(calls.some(call => call.type === 'get'), false);
});

test('rejects a dataset whose storage key belongs to another dataset', async () => {
  const { response, calls } = await callEndpoint({
    dataset: {
      ...DATASET,
      file_key: 'datasets/another-dataset/sample.csv'
    }
  });

  assert.equal(response.status, 404);
  assert.equal(calls.some(call => call.type === 'get'), false);
});

test('returns 404 when the R2 object does not exist', async () => {
  const { response, calls } = await callEndpoint({
    object: null
  });

  assert.equal(response.status, 404);
  assert.equal(calls.some(call => call.type === 'get'), true);
});

test('successfully downloads a published dataset with secure headers', async () => {
  const { response, calls } = await callEndpoint();

  const content = await response.text();

  assert.equal(response.status, 200);
  assert.equal(content, CSV_CONTENT);

  assert.equal(
    response.headers.get('Content-Type'),
    'text/csv; charset=utf-8'
  );

  assert.equal(
    response.headers.get('Content-Disposition'),
    'attachment; filename="sample.csv"'
  );

  assert.equal(
    response.headers.get('X-Content-Type-Options'),
    'nosniff'
  );

  assert.equal(
    response.headers.get('Cache-Control'),
    'private, no-store'
  );

  assert.equal(
    response.headers.get('ETag'),
    '"test-etag"'
  );

  assert.equal(
    calls.some(call =>
      call.type === 'run' &&
      call.sql.includes('download_count = download_count + 1')
    ),
    true
  );

  assert.deepEqual(
    calls.find(call => call.type === 'get').key,
    DATASET.file_key
  );
});

test('still delivers the dataset when download counter update fails', async () => {
  const { response } = await callEndpoint({
    counterError: true
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), CSV_CONTENT);
});

test('returns a service error when the database query fails', async () => {
  const { response } = await callEndpoint({
    queryError: true
  });

  assert.equal(response.status, 503);
});

test('returns a service error when R2 retrieval fails', async () => {
  const { response } = await callEndpoint({
    bucketError: true
  });

  assert.equal(response.status, 503);
});
