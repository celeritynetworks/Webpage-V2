import test from 'node:test';
import assert from 'node:assert/strict';

import {
  onRequestPost,
  onRequestGet
} from '../functions/api/admin/reviews.js';

const currentSubmission = {
  id: 'submission-001',
  score: null,
  status: 'submitted',
  feedback: null,
  review_revision: 0
};

const validReview = {
  submission_id: 'submission-001',
  score: 85,
  status: 'shortlisted',
  feedback: 'Strong project and good analysis.',
  reason: 'Initial assessment of the submitted project.'
};

function makePostRequest(body, headers = {}) {
  return new Request('https://example.test/api/admin/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://example.test',
      ...headers
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

function createMockDatabase({
  current = currentSubmission,
  batchResults = [
    { meta: { changes: 1 } },
    { meta: { changes: 1 } }
  ],
  history = []
} = {}) {
  const calls = [];

  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            sql,
            values,

            async first() {
              calls.push({ type: 'first', sql, values });
              return current;
            },

            async all() {
              calls.push({ type: 'all', sql, values });
              return { results: history };
            }
          };
        }
      };
    },

    async batch(statements) {
      calls.push({ type: 'batch', statements });
      return batchResults;
    }
  };

  return { db, calls };
}

const admin = {
  admin: {
    email: 'reviewer@celeritynetworks.com.ng'
  }
};

test('rejects review requests without administrator authentication', async () => {
  const { db, calls } = createMockDatabase();

  const response = await onRequestPost({
    request: makePostRequest(validReview),
    env: { REGISTRATIONS: db },
    data: {}
  });

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test('rejects review requests without a valid same-origin header', async () => {
  const { db, calls } = createMockDatabase();

  const response = await onRequestPost({
    request: makePostRequest(validReview, {
      Origin: 'https://attacker.example'
    }),
    env: { REGISTRATIONS: db },
    data: admin
  });

  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});

test('rejects a revision without a sufficiently long reason', async () => {
  const { db, calls } = createMockDatabase();

  const response = await onRequestPost({
    request: makePostRequest({
      ...validReview,
      reason: 'Too short'
    }),
    env: { REGISTRATIONS: db },
    data: admin
  });

  assert.equal(response.status, 400);
  assert.equal(calls.some(call => call.type === 'batch'), false);
});

test('rejects a review when the submission does not exist', async () => {
  const { db, calls } = createMockDatabase({
    current: null
  });

  const response = await onRequestPost({
    request: makePostRequest(validReview),
    env: { REGISTRATIONS: db },
    data: admin
  });

  assert.equal(response.status, 404);
  assert.equal(calls.some(call => call.type === 'batch'), false);
});

test('records the audit entry and increments the revision on success', async () => {
  const { db, calls } = createMockDatabase();

  const response = await onRequestPost({
    request: makePostRequest(validReview),
    env: { REGISTRATIONS: db },
    data: admin
  });

  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.success, true);
  assert.equal(result.review.score, 85);
  assert.equal(result.review.status, 'shortlisted');

  const batchCall = calls.find(call => call.type === 'batch');

  assert.ok(batchCall);
  assert.equal(batchCall.statements.length, 2);

  const auditStatement = batchCall.statements[0];
  const updateStatement = batchCall.statements[1];

  assert.match(
    auditStatement.sql,
    /INSERT INTO competition_project_submission_reviews/
  );

  assert.match(
    auditStatement.sql,
    /previous_score/
  );

  assert.match(
    auditStatement.sql,
    /reviewer_email/
  );

  assert.match(
    auditStatement.sql,
    /reason/
  );

  assert.equal(
    auditStatement.values[2],
    'reviewer@celeritynetworks.com.ng'
  );

  assert.equal(
    auditStatement.values[6],
    validReview.reason
  );

  assert.match(
    updateStatement.sql,
    /review_revision = review_revision \+ 1/
  );

  assert.match(
    updateStatement.sql,
    /AND review_revision = \?/
  );
});

test('rejects stale or concurrent review updates', async () => {
  const { db } = createMockDatabase({
    batchResults: [
      { meta: { changes: 0 } },
      { meta: { changes: 0 } }
    ]
  });

  const response = await onRequestPost({
    request: makePostRequest(validReview),
    env: { REGISTRATIONS: db },
    data: admin
  });

  assert.equal(response.status, 409);
});

test('rejects review history requests without administrator authentication', async () => {
  const { db, calls } = createMockDatabase();

  const response = await onRequestGet({
    request: new Request(
      'https://example.test/api/admin/reviews?submission_id=submission-001'
    ),
    env: { REGISTRATIONS: db },
    data: {}
  });

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test('returns review history for the requested submission', async () => {
  const history = [
    {
      id: 'review-002',
      submission_id: 'submission-001',
      reviewer_email: 'reviewer@celeritynetworks.com.ng',
      previous_score: 80,
      new_score: 85,
      previous_status: 'reviewing',
      new_status: 'shortlisted',
      previous_feedback: 'Initial feedback.',
      new_feedback: 'Strong project.',
      reason: 'Corrected the original assessment.',
      created_at: 1790000000
    }
  ];

  const { db, calls } = createMockDatabase({ history });

  const response = await onRequestGet({
    request: new Request(
      'https://example.test/api/admin/reviews?submission_id=submission-001'
    ),
    env: { REGISTRATIONS: db },
    data: admin
  });

  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.success, true);
  assert.deepEqual(result.reviews, history);

  const query = calls.find(call => call.type === 'all');

  assert.ok(query);
  assert.match(
    query.sql,
    /ORDER BY created_at DESC, id DESC/
  );
});

test('returns a service error when the database operation fails', async () => {
  const db = {
    prepare() {
      return {
        bind() {
          return {
            async first() {
              throw new Error('Simulated database failure');
            }
          };
        }
      };
    }
  };

  const response = await onRequestPost({
    request: makePostRequest(validReview),
    env: { REGISTRATIONS: db },
    data: admin
  });

  assert.equal(response.status, 503);
});

test('rejects an oversized review body when Content-Length is missing', async () => {
  const { db, calls } = createMockDatabase();

  const request = makePostRequest({
    ...validReview,
    feedback: 'x'.repeat(17000)
  });

  assert.equal(request.headers.get('Content-Length'), null);

  const response = await onRequestPost({
    request,
    env: { REGISTRATIONS: db },
    data: admin
  });

  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
});

test('rejects an oversized review body when Content-Length understates its size', async () => {
  const { db, calls } = createMockDatabase();

  const request = makePostRequest(
    {
      ...validReview,
      feedback: 'x'.repeat(17000)
    },
    {
      'Content-Length': '1'
    }
  );

  const response = await onRequestPost({
    request,
    env: { REGISTRATIONS: db },
    data: admin
  });

  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
});
