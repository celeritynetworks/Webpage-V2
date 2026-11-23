PRAGMA foreign_keys = ON;

ALTER TABLE competition_participants ADD COLUMN verified_at INTEGER;

CREATE TABLE IF NOT EXISTS competition_email_verifications (
    id TEXT PRIMARY KEY NOT NULL,
    participant_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_sent_at INTEGER NOT NULL,
    consumed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (participant_id)
        REFERENCES competition_participants(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_participant
ON competition_email_verifications(participant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_verifications_expiry
ON competition_email_verifications(expires_at);

CREATE TABLE IF NOT EXISTS competition_participant_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    participant_id TEXT NOT NULL,
    session_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    revoked_at INTEGER,
    FOREIGN KEY (participant_id)
        REFERENCES competition_participants(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_participant_sessions_participant
ON competition_participant_sessions(participant_id);

CREATE INDEX IF NOT EXISTS idx_participant_sessions_expiry
ON competition_participant_sessions(expires_at);
