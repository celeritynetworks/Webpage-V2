PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS competition_participants (
    id TEXT PRIMARY KEY,
    competition_id TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    organization TEXT,
    status TEXT NOT NULL DEFAULT 'registered'
        CHECK (status IN ('registered', 'cancelled')),
    registered_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (competition_id) REFERENCES competitions(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_competition_participants_unique_email
ON competition_participants(competition_id, email COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_competition_participants_competition
ON competition_participants(competition_id);

CREATE INDEX IF NOT EXISTS idx_competition_participants_email
ON competition_participants(email);
