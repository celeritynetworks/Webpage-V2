import test from "node:test";
import assert from "node:assert/strict";

import {
  onRequestPost as saveProfile
} from "../functions/api/competitions/participant/profile.js";

import {
  onRequestGet as getLeaderboard
} from "../functions/api/competitions/[slug]/leaderboard.js";

const TOKEN = "A".repeat(43);
const ORIGIN = "https://celeritynetworks.com.ng";

const VALID_PROFILE = {
  public_display_name: "Analytics Builder",
  public_bio: "I enjoy turning data into useful insights.",
  portfolio_url: "https://example.com/portfolio",
  linkedin_url: "https://www.linkedin.com/in/example",
  public_profile_enabled: true
};

async function hashToken(token) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );

  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createProfileEnv(options = {}) {
  const calls = [];
  const sessionHashPromise = hashToken(TOKEN);

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

          if (options.lookupError) {
            throw new Error("Mock participant lookup failure");
          }

          if (sql.includes("FROM competition_participant_sessions")) {
            return options.participant === undefined
              ? {
                  participant_id: "participant-test-001",
                  competition_id: "competition-test-001",
                  submission_id: "submission-test-001"
                }
              : options.participant;
          }

          throw new Error("Unexpected first() query");
        },

        async run() {
          calls.push({
            type: "run",
            sql,
            values: this.values
          });

          if (options.updateError) {
            throw new Error("Mock profile update failure");
          }

          return {
            meta: {
              changes: options.changes ?? 1
            }
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
    calls,
    sessionHashPromise
  };
}

function makeProfileRequest(body = VALID_PROFILE, options = {}) {
  const headers = new Headers();

  headers.set("Content-Type", options.contentType ?? "application/json");

  if (options.origin !== null) {
    headers.set("Origin", options.origin ?? ORIGIN);
  }

  if (options.fetchSite) {
    headers.set("Sec-Fetch-Site", options.fetchSite);
  }

  if (options.cookie !== null) {
    headers.set(
      "Cookie",
      options.cookie ?? `celerity_participant_session=${TOKEN}`
    );
  }

  const rawBody = options.rawBody ?? JSON.stringify(body);

  return new Request(
    `${ORIGIN}/api/competitions/participant/profile`,
    {
      method: "POST",
      headers,
      body: rawBody
    }
  );
}

async function callProfile(body = VALID_PROFILE, options = {}) {
  const { env, calls } = createProfileEnv(options);

  const response = await saveProfile({
    request: makeProfileRequest(body, options),
    env
  });

  const data = await response.json();

  return { response, data, calls };
}

test("profile: saves an authenticated participant public profile", async () => {
  const { response, data, calls } = await callProfile();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(
    data.project_submission.public_display_name,
    VALID_PROFILE.public_display_name
  );
  assert.equal(data.project_submission.public_profile_enabled, 1);

  const update = calls.find(call => call.type === "run");

  assert.ok(update);
  assert.match(update.sql, /UPDATE competition_project_submissions/i);
  assert.match(update.sql, /public_profile_enabled = \?/i);
  assert.match(update.sql, /s\.revoked_at IS NULL/i);
  assert.match(update.sql, /p\.verified_at IS NOT NULL/i);
});

test("profile: rejects a missing database binding", async () => {
  const { response } = await callProfile(VALID_PROFILE, {
    missingDatabase: true
  });

  assert.equal(response.status, 503);
});

test("profile: rejects a missing or invalid origin", async () => {
  const missing = await callProfile(VALID_PROFILE, {
    origin: null
  });

  const foreign = await callProfile(VALID_PROFILE, {
    origin: "https://attacker.example"
  });

  assert.equal(missing.response.status, 403);
  assert.equal(foreign.response.status, 403);
  assert.equal(missing.calls.length, 0);
  assert.equal(foreign.calls.length, 0);
});

test("profile: rejects cross-site fetch requests", async () => {
  const { response, calls } = await callProfile(VALID_PROFILE, {
    fetchSite: "cross-site"
  });

  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});

test("profile: rejects non-JSON requests", async () => {
  const { response, calls } = await callProfile(VALID_PROFILE, {
    contentType: "text/plain"
  });

  assert.equal(response.status, 415);
  assert.equal(calls.length, 0);
});

test("profile: rejects malformed JSON", async () => {
  const { response, calls } = await callProfile({}, {
    rawBody: "{invalid json"
  });

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("profile: rejects request bodies larger than 4096 bytes", async () => {
  const { response, calls } = await callProfile({}, {
    rawBody: JSON.stringify({
      ...VALID_PROFILE,
      public_bio: "x".repeat(5000)
    })
  });

  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
});

test("profile: rejects missing or malformed session cookies", async () => {
  const missing = await callProfile(VALID_PROFILE, {
    cookie: null
  });

  const malformed = await callProfile(VALID_PROFILE, {
    cookie: "celerity_participant_session=invalid"
  });

  assert.equal(missing.response.status, 401);
  assert.equal(malformed.response.status, 401);
  assert.equal(missing.calls.length, 0);
  assert.equal(malformed.calls.length, 0);
});

test("profile: rejects participants without an eligible submission", async () => {
  const { response, data, calls } = await callProfile(VALID_PROFILE, {
    participant: null
  });

  assert.equal(response.status, 401);
  assert.match(data.error, /session is invalid|not submitted/i);
  assert.equal(calls.filter(call => call.type === "run").length, 0);
});

test("profile: rejects invalid LinkedIn URLs", async () => {
  const { response, calls } = await callProfile({
    ...VALID_PROFILE,
    linkedin_url: "https://linkedin.example.com.evil.test/profile"
  });

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("profile: rejects non-HTTPS portfolio URLs", async () => {
  const { response, calls } = await callProfile({
    ...VALID_PROFILE,
    portfolio_url: "http://example.com"
  });

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("profile: requires a display name when public listing is enabled", async () => {
  const { response, calls } = await callProfile({
    ...VALID_PROFILE,
    public_display_name: "   "
  });

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("profile: rejects unexpected fields", async () => {
  const { response, calls } = await callProfile({
    ...VALID_PROFILE,
    participant_id: "attacker-controlled-id"
  });

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("profile: permits disabling public listing", async () => {
  const { response, data, calls } = await callProfile({
    ...VALID_PROFILE,
    public_profile_enabled: false
  });

  assert.equal(response.status, 200);
  assert.equal(data.project_submission.public_profile_enabled, 0);

  const update = calls.find(call => call.type === "run");
  assert.ok(update);
  assert.equal(update.values[4], 0);
});

test("profile: rejects an update when the session is no longer valid", async () => {
  const { response } = await callProfile(VALID_PROFILE, {
    changes: 0
  });

  assert.equal(response.status, 401);
});

test("profile: returns a service error when the database update fails", async () => {
  const { response, data } = await callProfile(VALID_PROFILE, {
    updateError: true
  });

  assert.equal(response.status, 503);
  assert.match(data.error, /unable to update/i);
});

function createLeaderboardEnv(options = {}) {
  const calls = [];

  const competition = options.competition === undefined
    ? {
        id: "competition-test-001",
        title: "Analytics Challenge",
        slug: "analytics-challenge",
        status: "completed",
        ends_at: "2026-12-15T17:00:00.000Z"
      }
    : options.competition;

  const ranking = options.ranking ?? [
    {
      id: "submission-001",
      name: "Analytics Builder",
      score: 95,
      submitted_at: "2026-12-01T10:00:00.000Z",
      portfolio_url: "https://example.com/portfolio",
      linkedin_url: "https://www.linkedin.com/in/example"
    },
    {
      id: "submission-002",
      name: "Data Explorer",
      score: 88,
      submitted_at: "2026-12-02T10:00:00.000Z",
      portfolio_url: null,
      linkedin_url: null
    }
  ];

  const winner = options.winner === undefined
    ? {
        id: "submission-001",
        name: "Analytics Builder",
        public_bio: "I enjoy turning data into useful insights.",
        score: 95,
        portfolio_url: "https://example.com/portfolio",
        linkedin_url: "https://www.linkedin.com/in/example"
      }
    : options.winner;

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

          if (options.queryError) {
            throw new Error("Mock leaderboard query failure");
          }

          if (sql.includes("FROM competitions")) {
            return competition;
          }

          if (sql.includes("FROM competition_project_submissions")) {
            return winner;
          }

          throw new Error("Unexpected leaderboard first() query");
        },

        async all() {
          calls.push({
            type: "all",
            sql,
            values: this.values
          });

          if (options.queryError) {
            throw new Error("Mock ranking query failure");
          }

          return {
            results: ranking
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

async function callLeaderboard(options = {}) {
  const { env, calls } = createLeaderboardEnv(options);

  const response = await getLeaderboard({
    params: {
      slug: options.slug ?? "analytics-challenge"
    },
    env
  });

  const data = await response.json();

  return { response, data, calls };
}

test("leaderboard: returns opted-in ranked participants and featured winner", async () => {
  const { response, data, calls } = await callLeaderboard();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.leaderboard.length, 2);
  assert.equal(data.leaderboard[0].rank, 1);
  assert.equal(data.leaderboard[0].name, "Analytics Builder");
  assert.equal(data.leaderboard[0].score, 95);
  assert.equal(data.winner.name, "Analytics Builder");
  assert.equal(data.winner.score, 95);

  const rankingQuery = calls.find(call => call.type === "all");

  assert.match(rankingQuery.sql, /public_profile_enabled = 1/i);
  assert.match(rankingQuery.sql, /status IN \('shortlisted', 'winner'\)/i);
  assert.match(rankingQuery.sql, /LIMIT 10/i);
});

test("leaderboard: returns an empty ranking and no winner when no one is listed", async () => {
  const { response, data } = await callLeaderboard({
    ranking: [],
    winner: null
  });

  assert.equal(response.status, 200);
  assert.deepEqual(data.leaderboard, []);
  assert.equal(data.winner, null);
});

test("leaderboard: rejects an empty competition slug", async () => {
  const { response, calls } = await callLeaderboard({
    slug: ""
  });

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("leaderboard: returns not found for an unavailable competition", async () => {
  const { response, data, calls } = await callLeaderboard({
    competition: null
  });

  assert.equal(response.status, 404);
  assert.match(data.error, /not found/i);
  assert.equal(calls.filter(call => call.type === "all").length, 0);
});

test("leaderboard: rejects a missing database binding", async () => {
  const { response } = await callLeaderboard({
    missingDatabase: true
  });

  assert.equal(response.status, 503);
});

test("leaderboard: handles database failures without exposing internal errors", async () => {
  const { response, data } = await callLeaderboard({
    queryError: true
  });

  assert.equal(response.status, 503);
  assert.match(data.error, /unable to load/i);
  assert.doesNotMatch(data.error, /Mock leaderboard query failure/i);
});

test("leaderboard: filters non-HTTPS profile links", async () => {
  const { response, data } = await callLeaderboard({
    ranking: [
      {
        id: "submission-003",
        name: "Secure Links Test",
        score: 90,
        submitted_at: "2026-12-03T10:00:00.000Z",
        portfolio_url: "javascript:alert(1)",
        linkedin_url: "http://linkedin.com/in/example"
      }
    ],
    winner: {
      id: "submission-003",
      name: "Secure Links Test",
      public_bio: "",
      score: 90,
      portfolio_url: "javascript:alert(1)",
      linkedin_url: "http://linkedin.com/in/example"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(data.leaderboard[0].portfolio_url, null);
  assert.equal(data.leaderboard[0].linkedin_url, null);
  assert.equal(data.winner.portfolio_url, null);
  assert.equal(data.winner.linkedin_url, null);
});