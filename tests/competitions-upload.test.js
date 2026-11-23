import test from "node:test";
import assert from "node:assert/strict";

import {
  onRequestPost
} from "../functions/api/admin/competitions.js";

const ADMIN = {
  admin: {
    email: "reviewer@celeritynetworks.com.ng"
  }
};

const CSV = "id,name\n1,Ada\n";

function createForm(overrides = {}) {
  const form = new FormData();

  const fields = {
    title: "Analytics Challenge",
    slug: "analytics-challenge",
    description: "A competition for testing analytical skills.",
    industry_id: "industry-test-001",
    difficulty: "Beginner",
    instructions: "Analyse the supplied data and submit your findings.",
    record_count: "1",
    registration_opens_at: "",
    registration_closes_at: "",
    starts_at: "2026-12-01T09:00:00.000Z",
    ends_at: "2026-12-15T17:00:00.000Z",
    status: "draft",
    ...overrides
  };

  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }

  const fileContent = overrides.fileContent ?? CSV;
  const fileName = overrides.fileName ?? "challenge.csv";

  form.append(
    "file",
    new File([fileContent], fileName, { type: "text/csv" })
  );

  return form;
}

function createEnv(options = {}) {
  const calls = [];
  const storedObjects = new Map();

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
            type: "first",
            sql,
            values: this.values
          });

          if (options.industryError) {
            throw new Error("Mock industry lookup failure");
          }

          if (sql.includes("FROM industries")) {
            return options.industry === undefined
              ? { id: "industry-test-001" }
              : options.industry;
          }

          throw new Error("Unexpected first() query");
        },

        async run() {
          calls.push({
            type: "run",
            sql,
            values: this.values
          });

          if (options.insertError) {
            throw new Error(options.insertError);
          }

          return { meta: { changes: 1 } };
        }
      };

      return statement;
    }
  };

  const bucket = {
    async put(key, value, metadata) {
      calls.push({
        type: "put",
        key,
        metadata
      });

      storedObjects.set(key, value);
    },

    async delete(key) {
      calls.push({
        type: "delete",
        key
      });

      storedObjects.delete(key);
    }
  };

  return {
    env: {
      REGISTRATIONS: options.missingDatabase ? null : db,
      DATASETS_BUCKET: options.missingBucket ? null : bucket
    },
    calls,
    storedObjects
  };
}

function makeRequest(form = createForm(), options = {}) {
  const headers = new Headers();

  if (options.origin !== null) {
    headers.set(
      "Origin",
      options.origin ?? "https://celeritynetworks.com.ng"
    );
  }

  if (options.fetchSite) {
    headers.set("Sec-Fetch-Site", options.fetchSite);
  }

  if (options.contentType) {
    headers.set("Content-Type", options.contentType);
  }

  return new Request(
    "https://celeritynetworks.com.ng/api/admin/competitions",
    {
      method: "POST",
      headers,
      body: form
    }
  );
}

async function callEndpoint(options = {}) {
  const {
    env,
    calls,
    storedObjects
  } = createEnv(options);

  const response = await onRequestPost({
    request: makeRequest(
      options.form ?? createForm(),
      options.requestOptions
    ),
    env,
    data: options.unauthenticated ? {} : ADMIN
  });

  const data = await response.json();

  return {
    response,
    data,
    calls,
    storedObjects
  };
}

test("rejects unauthenticated competition uploads", async () => {
  const { response, calls } = await callEndpoint({
    unauthenticated: true
  });

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("rejects missing database or R2 bindings", async () => {
  const database = await callEndpoint({
    missingDatabase: true
  });

  assert.equal(database.response.status, 503);
  assert.equal(database.calls.length, 0);

  const bucket = await callEndpoint({
    missingBucket: true
  });

  assert.equal(bucket.response.status, 503);
  assert.equal(bucket.calls.length, 0);
});

test("rejects requests from an untrusted origin", async () => {
  const { response, calls } = await callEndpoint({
    requestOptions: {
      origin: "https://attacker.example"
    }
  });

  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});

test("rejects cross-site requests", async () => {
  const { response, calls } = await callEndpoint({
    requestOptions: {
      fetchSite: "cross-site"
    }
  });

  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});

test("rejects requests that are not multipart form data", async () => {
  const { response, calls } = await callEndpoint({
    requestOptions: {
      contentType: "application/json"
    }
  });

  assert.equal(response.status, 415);
  assert.equal(calls.length, 0);
});

test("rejects invalid competition metadata before uploading to R2", async () => {
  const { response, calls } = await callEndpoint({
    form: createForm({
      title: "",
      slug: "Invalid Slug"
    })
  });

  assert.equal(response.status, 400);
  assert.equal(calls.some(call => call.type === "put"), false);
});

test("rejects invalid competition dates", async () => {
  const { response, calls } = await callEndpoint({
    form: createForm({
      starts_at: "not-a-date"
    })
  });

  assert.equal(response.status, 400);
  assert.equal(calls.some(call => call.type === "put"), false);
});

test("rejects an end date that is not after the start date", async () => {
  const { response, calls } = await callEndpoint({
    form: createForm({
      starts_at: "2026-12-15T17:00:00.000Z",
      ends_at: "2026-12-01T09:00:00.000Z"
    })
  });

  assert.equal(response.status, 400);
  assert.equal(calls.some(call => call.type === "put"), false);
});

test("rejects an invalid competition status", async () => {
  const { response, calls } = await callEndpoint({
    form: createForm({
      status: "published"
    })
  });

  assert.equal(response.status, 400);
  assert.equal(calls.some(call => call.type === "put"), false);
});

test("rejects file contents that do not match the extension", async () => {
  const { response, calls } = await callEndpoint({
    form: createForm({
      fileContent: new Uint8Array([0xFF, 0xFE, 0x00, 0x01]),
      fileName: "invalid.csv"
    })
  });

  assert.equal(response.status, 400);
  assert.equal(calls.some(call => call.type === "put"), false);
});

test("rejects an unknown industry before uploading to R2", async () => {
  const { response, calls } = await callEndpoint({
    industry: null
  });

  assert.equal(response.status, 400);
  assert.equal(calls.some(call => call.type === "put"), false);
});

test("returns a controlled service error when industry lookup fails", async () => {
  const { response, data, calls } = await callEndpoint({
    industryError: true
  });

  assert.equal(response.status, 503);
  assert.equal(data.success, false);
  assert.equal(calls.some(call => call.type === "put"), false);
});

test("successfully uploads a competition file to R2 and saves its metadata", async () => {
  const {
    response,
    data,
    calls,
    storedObjects
  } = await callEndpoint();

  assert.equal(response.status, 201);
  assert.equal(data.success, true);
  assert.equal(data.competition.title, "Analytics Challenge");
  assert.equal(data.competition.slug, "analytics-challenge");
  assert.equal(data.competition.status, "draft");

  const upload = calls.find(call => call.type === "put");
  const insert = calls.find(call =>
    call.type === "run" &&
    call.sql.includes("INSERT INTO competitions")
  );

  assert.ok(upload, "Expected an R2 upload");
  assert.ok(insert, "Expected a D1 metadata insert");

  assert.match(upload.key, /^competitions\/[^/]+\/challenge\.csv$/);

  assert.equal(
    upload.metadata.customMetadata.uploadedBy,
    ADMIN.admin.email
  );

  assert.equal(insert.values[0], data.competition.id);
  assert.equal(insert.values[1], "Analytics Challenge");
  assert.equal(insert.values[2], "analytics-challenge");
  assert.equal(insert.values[7], upload.key);
  assert.equal(insert.values[16], "draft");

  assert.equal(storedObjects.has(upload.key), true);

  assert.equal(
    new TextDecoder().decode(
      new Uint8Array(storedObjects.get(upload.key))
    ),
    CSV
  );
});

test("deletes the R2 object when the D1 insert fails", async () => {
  const {
    response,
    data,
    calls,
    storedObjects
  } = await callEndpoint({
    insertError: "Database insert failure"
  });

  assert.equal(response.status, 503);
  assert.equal(data.success, false);

  const upload = calls.find(call => call.type === "put");
  const deletion = calls.find(call => call.type === "delete");

  assert.ok(upload, "Expected the R2 upload");
  assert.ok(deletion, "Expected cleanup after D1 failure");
  assert.equal(deletion.key, upload.key);
  assert.equal(storedObjects.has(upload.key), false);
});

test("returns conflict and cleans up R2 when the competition slug is already in use", async () => {
  const {
    response,
    data,
    calls,
    storedObjects
  } = await callEndpoint({
    insertError: "UNIQUE constraint failed: competitions.slug"
  });

  assert.equal(response.status, 409);
  assert.equal(data.success, false);

  const upload = calls.find(call => call.type === "put");
  const deletion = calls.find(call => call.type === "delete");

  assert.ok(upload);
  assert.ok(deletion);
  assert.equal(deletion.key, upload.key);
  assert.equal(storedObjects.has(upload.key), false);
});
