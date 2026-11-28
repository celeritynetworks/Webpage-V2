CREATE TABLE competition_project_submission_reviews (
    id TEXT PRIMARY KEY NOT NULL,

    submission_id TEXT NOT NULL,

    reviewer_email TEXT NOT NULL,

    previous_score REAL
        CHECK (
            previous_score IS NULL
            OR (previous_score >= 0 AND previous_score <= 100)
        ),

    new_score REAL
        CHECK (
            new_score IS NULL
            OR (new_score >= 0 AND new_score <= 100)
        ),

    previous_status TEXT
        CHECK (
            previous_status IS NULL
            OR previous_status IN (
                'submitted',
                'reviewing',
                'shortlisted',
                'winner',
                'not_selected',
                'requires_revision'
            )
        ),

    new_status TEXT
        CHECK (
            new_status IS NULL
            OR new_status IN (
                'submitted',
                'reviewing',
                'shortlisted',
                'winner',
                'not_selected',
                'requires_revision'
            )
        ),

    previous_feedback TEXT,
    new_feedback TEXT,

    reason TEXT NOT NULL
        CHECK (length(trim(reason)) BETWEEN 10 AND 1000),

    created_at INTEGER NOT NULL DEFAULT (unixepoch()),

    FOREIGN KEY (submission_id)
        REFERENCES competition_project_submissions(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE INDEX idx_project_reviews_submission
ON competition_project_submission_reviews(submission_id, created_at);

CREATE INDEX idx_project_reviews_reviewer
ON competition_project_submission_reviews(reviewer_email, created_at);

CREATE TRIGGER prevent_project_review_update
BEFORE UPDATE ON competition_project_submission_reviews
BEGIN
    SELECT RAISE(ABORT, 'Review history is immutable');
END;

CREATE TRIGGER prevent_project_review_delete
BEFORE DELETE ON competition_project_submission_reviews
BEGIN
    SELECT RAISE(ABORT, 'Review history cannot be deleted');
END;
