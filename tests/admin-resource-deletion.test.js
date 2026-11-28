import test from "node:test";
import assert from "node:assert/strict";

import { onRequestDelete as deleteDataset } from "../functions/api/admin/datasets.js";
import { onRequestDelete as removeCompetition } from "../functions/api/admin/competitions.js";

const admin = { admin: { email: "celeritynetworksltd@gmail.com" } };

function makeRequest(url, body) {
  return new Request(url, {
    method: "DELETE",
    headers: {
      "Origin": new URL(url).origin,
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "same-origin"
    },
    body: JSON.stringify(body)
  });
}

function mockDb({ dataset, competition, failRun = false } = {}) {
  const statements = [];
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (/FROM datasets/i.test(sql)) return dataset || null;
              if (/FROM competitions c/i.test(sql)) return competition || null;
              if (/FROM competition_participants/i.test(sql)) return competition || {
                participant_count: 0, project_submission_count: 0, legacy_submission_count: 0
              };
              return null;
            },
            async run() {
              statements.push({ sql, args });
              if (failRun) throw new Error("simulated D1 failure");
              return { success: true };
            },
            async all() {
              return { results: [] };
            }
          };
        }
      };
    }
  };
  return { db, statements };
}

function mockBucket({ fail = false } = {}) {
  const deleted = [];
  return {
    deleted,
    async delete(key) {
      if (fail) throw new Error("simulated R2 failure");
      deleted.push(key);
    }
  };
}

test("dataset deletion requires an authenticated administrator", async () => {
  const { db, statements } = mockDb({ dataset: { id: "d1", title: "Dataset", file_key: "datasets/d1/file.csv" } });
  const response = await deleteDataset({
    request: makeRequest("https://example.com/api/admin/datasets", {
      id: "d1", confirmName: "Dataset", reason: "Requested by content owner"
    }),
    env: { REGISTRATIONS: db, DATASETS_BUCKET: mockBucket() },
    data: {}
  });
  assert.equal(response.status, 401);
  assert.equal(statements.length, 0);
});

test("dataset deletion requires matching title confirmation", async () => {
  const { db, statements } = mockDb({ dataset: { id: "d1", title: "Dataset", file_key: "datasets/d1/file.csv" } });
  const bucket = mockBucket();
  const response = await deleteDataset({
    request: makeRequest("https://example.com/api/admin/datasets", {
      id: "d1", confirmName: "Wrong title", reason: "Requested by content owner"
    }),
    env: { REGISTRATIONS: db, DATASETS_BUCKET: bucket },
    data: admin
  });
  assert.equal(response.status, 409);
  assert.equal(bucket.deleted.length, 0);
  assert.equal(statements.length, 0);
});

test("dataset deletion archives first, removes the R2 object and records audit events", async () => {
  const { db, statements } = mockDb({ dataset: { id: "d1", title: "Dataset", file_key: "datasets/d1/file.csv" } });
  const bucket = mockBucket();
  const response = await deleteDataset({
    request: makeRequest("https://example.com/api/admin/datasets", {
      id: "d1", confirmName: "Dataset", reason: "Dataset is obsolete and replaced"
    }),
    env: { REGISTRATIONS: db, DATASETS_BUCKET: bucket },
    data: admin
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.action, "deleted");
  assert.deepEqual(bucket.deleted, ["datasets/d1/file.csv"]);
  assert.ok(statements.some(item => /UPDATE datasets SET status = 'archived'/i.test(item.sql)));
  assert.ok(statements.some(item => /DELETE FROM datasets/i.test(item.sql)));
  assert.equal(statements.filter(item => /INSERT INTO admin_resource_audit/i.test(item.sql)).length, 2);
});

test("dataset R2 failure leaves the database record archived and records failure", async () => {
  const { db, statements } = mockDb({ dataset: { id: "d1", title: "Dataset", file_key: "datasets/d1/file.csv" } });
  const bucket = mockBucket({ fail: true });
  const response = await deleteDataset({
    request: makeRequest("https://example.com/api/admin/datasets", {
      id: "d1", confirmName: "Dataset", reason: "Dataset is obsolete and replaced"
    }),
    env: { REGISTRATIONS: db, DATASETS_BUCKET: bucket },
    data: admin
  });
  assert.equal(response.status, 503);
  assert.ok(statements.some(item => /UPDATE datasets SET status = 'archived'/i.test(item.sql)));
  assert.ok(!statements.some(item => /DELETE FROM datasets/i.test(item.sql)));
  assert.ok(statements.some(item => /INSERT INTO admin_resource_audit/i.test(item.sql) && item.args.includes('delete_failed')));
});

test("competition with participant history is archived and its dataset is preserved", async () => {
  const { db, statements } = mockDb({
    competition: {
      id: "c1", title: "Challenge", dataset_file_key: "competitions/c1/file.zip",
      participant_count: 3, project_submission_count: 1, legacy_submission_count: 0
    }
  });
  const bucket = mockBucket();
  const response = await removeCompetition({
    request: makeRequest("https://example.com/api/admin/competitions", {
      id: "c1", confirmName: "Challenge", reason: "Challenge is no longer active"
    }),
    env: { REGISTRATIONS: db, DATASETS_BUCKET: bucket },
    data: admin
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.action, "archived");
  assert.deepEqual(bucket.deleted, []);
  assert.ok(statements.some(item => /UPDATE competitions\s+SET status = 'archived'/i.test(item.sql)));
  assert.ok(!statements.some(item => /DELETE FROM competitions/i.test(item.sql)));
  assert.equal(statements.filter(item => /INSERT INTO admin_resource_audit/i.test(item.sql)).length, 2);
});

test("competition without participant or submission history can be deleted", async () => {
  const { db, statements } = mockDb({
    competition: {
      id: "c1", title: "Empty Challenge", dataset_file_key: "competitions/c1/file.zip",
      participant_count: 0, project_submission_count: 0, legacy_submission_count: 0
    }
  });
  const bucket = mockBucket();
  const response = await removeCompetition({
    request: makeRequest("https://example.com/api/admin/competitions", {
      id: "c1", confirmName: "Empty Challenge", reason: "Draft challenge created in error"
    }),
    env: { REGISTRATIONS: db, DATASETS_BUCKET: bucket },
    data: admin
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.action, "deleted");
  assert.deepEqual(bucket.deleted, ["competitions/c1/file.zip"]);
  assert.ok(statements.some(item => /DELETE FROM competitions/i.test(item.sql)));
});

test("competition deletion rejects missing audit reason", async () => {
  const { db } = mockDb();
  const response = await removeCompetition({
    request: makeRequest("https://example.com/api/admin/competitions", {
      id: "c1", confirmName: "Challenge", reason: "short"
    }),
    env: { REGISTRATIONS: db, DATASETS_BUCKET: mockBucket() },
    data: admin
  });
  assert.equal(response.status, 400);
});


test("competition with legacy submission history is archived rather than deleted", async () => {
  const { db, statements } = mockDb({
    competition: {
      id: "c2", title: "Legacy Challenge", dataset_file_key: "competitions/c2/file.zip",
      participant_count: 0, project_submission_count: 0, legacy_submission_count: 2
    }
  });
  const bucket = mockBucket();
  const response = await removeCompetition({
    request: makeRequest("https://example.com/api/admin/competitions", {
      id: "c2", confirmName: "Legacy Challenge", reason: "Legacy challenge is no longer active"
    }),
    env: { REGISTRATIONS: db, DATASETS_BUCKET: bucket },
    data: admin
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.action, "archived");
  assert.deepEqual(bucket.deleted, []);
  assert.ok(!statements.some(item => /DELETE FROM competitions/i.test(item.sql)));
});
