ALTER TABLE competition_project_submissions
ADD COLUMN review_revision INTEGER NOT NULL DEFAULT 0
CHECK (review_revision >= 0);
