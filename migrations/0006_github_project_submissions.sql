PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS competition_project_submissions (
    id TEXT PRIMARY KEY NOT NULL,

    competition_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,

    participant_name TEXT NOT NULL,
    participant_email TEXT NOT NULL,

    repository_url TEXT NOT NULL,
    repository_owner TEXT NOT NULL,
    repository_name TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN (
            'submitted',
            'reviewing',
            'shortlisted',
            'winner',
            'not_selected',
            'requires_revision'
        )),

    score REAL,
    feedback TEXT,

    submitted_at INTEGER NOT NULL,
    reviewed_at INTEGER,

    UNIQUE (competition_id, participant_id),

    FOREIGN KEY (competition_id)
        REFERENCES competitions(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    FOREIGN KEY (participant_id)
        REFERENCES competition_participants(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_project_submissions_competition
    ON competition_project_submissions(competition_id);

CREATE INDEX IF NOT EXISTS idx_project_submissions_participant
    ON competition_project_submissions(participant_id);

CREATE INDEX IF NOT EXISTS idx_project_submissions_status
    ON competition_project_submissions(status);
