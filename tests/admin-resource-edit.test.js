import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPut as updateDataset } from '../functions/api/admin/datasets.js';
import { onRequestPut as updateCompetition } from '../functions/api/admin/competitions.js';

const admin = { admin: { email: 'admin@celeritynetworks.com.ng' } };

function multipartRequest(url, fields, method = 'PUT') {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request(url, { method, headers: { Origin: new URL(url).origin }, body: form });
}

function createDb({ dataset, competition }) {
  const statements = [];
  const db = {
    prepare(sql) {
      const statement = { sql, values: [], bind(...values) { this.values = values; return this; }, async first() {
        if (sql.includes('FROM datasets WHERE id')) return dataset || null;
        if (sql.includes('FROM competitions WHERE id')) return competition || null;
        if (sql.includes('FROM industries')) return { id: 'industry-1' };
        return null;
      }, async run() { statements.push({ sql, values: this.values }); return { meta: { changes: 1 } }; } };
      return statement;
    },
    async batch(items) { for (const item of items) statements.push({ sql: item.sql, values: item.values }); return []; }
  };
  return { db, statements };
}

function bucket() {
  const puts = [];
  const deletes = [];
  return { puts, deletes, async put(key, value, metadata) { puts.push({ key, metadata }); }, async delete(key) { deletes.push(key); } };
}

test('dataset drafts can be edited and published without re-uploading the stored file', async () => {
  const { db, statements } = createDb({ dataset: {
    id: 'dataset-1', title: 'Old title', file_key: 'datasets/dataset-1/data.csv',
    file_name: 'data.csv', file_format: 'csv', file_size_bytes: 24, thumbnail_key: null, published_at: null
  } });
  const storage = bucket();
  const response = await updateDataset({
    request: multipartRequest('https://celeritynetworks.com.ng/api/admin/datasets', {
      id: 'dataset-1', industry_id: 'industry-1', title: 'Updated title', slug: 'updated-title',
      description: 'A complete dataset description.', difficulty: 'Beginner', record_count: '10',
      column_count: '4', learning_objectives: JSON.stringify(['One','Two','Three','Four']), tags: '[]', status: 'published'
    }),
    env: { REGISTRATIONS: db, DATASETS_BUCKET: storage }, data: admin
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.dataset.status, 'published');
  assert.equal(statements.some(item => item.sql.includes('UPDATE datasets SET')), true);
  assert.equal(storage.puts.length, 0);
});

test('competition drafts can be edited and published as live when the start time has arrived', async () => {
  const { db, statements } = createDb({ competition: {
    id: 'competition-1', title: 'Old challenge', status: 'draft',
    dataset_file_key: 'competitions/competition-1/data.csv', dataset_file_name: 'data.csv',
    dataset_file_format: 'csv', dataset_file_size_bytes: 24, thumbnail_key: null
  } });
  const storage = bucket();
  const now = Date.now();
  const response = await updateCompetition({
    request: multipartRequest('https://celeritynetworks.com.ng/api/admin/competitions', {
      id: 'competition-1', title: 'Updated challenge', slug: 'updated-challenge',
      description: 'A complete challenge description.', industry_id: '', difficulty: 'Beginner',
      instructions: 'Analyse the data and submit a report.', record_count: '10',
      registration_opens_at: '', registration_closes_at: '',
      starts_at: new Date(now - 3600000).toISOString(), ends_at: new Date(now + 86400000).toISOString(),
      status: 'published'
    }),
    env: { REGISTRATIONS: db, DATASETS_BUCKET: storage }, data: admin
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.competition.status, 'active');
  assert.equal(statements.some(item => item.sql.includes('UPDATE competitions SET')), true);
  assert.equal(storage.puts.length, 0);
});

test('editing a published competition requires an audit reason', async () => {
  const { db } = createDb({ competition: {
    id: 'competition-2', title: 'Published challenge', status: 'active',
    dataset_file_key: 'competitions/competition-2/data.csv', dataset_file_name: 'data.csv',
    dataset_file_format: 'csv', dataset_file_size_bytes: 24, thumbnail_key: null
  } });
  const response = await updateCompetition({
    request: multipartRequest('https://celeritynetworks.com.ng/api/admin/competitions', {
      id: 'competition-2', title: 'Published challenge', slug: 'published-challenge',
      description: 'A complete challenge description.', industry_id: '', difficulty: 'Beginner',
      instructions: 'Analyse the data and submit a report.', record_count: '10',
      registration_opens_at: '', registration_closes_at: '',
      starts_at: new Date(Date.now() - 3600000).toISOString(), ends_at: new Date(Date.now() + 86400000).toISOString(),
      status: 'published'
    }),
    env: { REGISTRATIONS: db, DATASETS_BUCKET: bucket() }, data: admin
  });
  assert.equal(response.status, 400);
});

test('published competition edits update the record and append an updated audit event', async () => {
  const { db, statements } = createDb({ competition: {
    id: 'competition-3', title: 'Published challenge', status: 'active',
    dataset_file_key: 'competitions/competition-3/data.csv', dataset_file_name: 'data.csv',
    dataset_file_format: 'csv', dataset_file_size_bytes: 24, thumbnail_key: null
  } });
  const response = await updateCompetition({
    request: multipartRequest('https://celeritynetworks.com.ng/api/admin/competitions', {
      id: 'competition-3', title: 'Revised challenge', slug: 'revised-challenge',
      description: 'Updated challenge description.', industry_id: '', difficulty: 'Beginner',
      instructions: 'Analyse the data and submit a report.', record_count: '10',
      registration_opens_at: '', registration_closes_at: '',
      starts_at: new Date(Date.now() - 3600000).toISOString(),
      ends_at: new Date(Date.now() + 86400000).toISOString(),
      status: 'published', reason: 'Clarified challenge scope and corrected instructions'
    }),
    env: { REGISTRATIONS: db, DATASETS_BUCKET: bucket() }, data: admin
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.success, true);
  assert.equal(statements.some(item => item.sql.includes('UPDATE competitions SET')), true);
  assert.equal(statements.some(item => item.sql.includes("'updated'")), true);
});
