ALTER TABLE competition_project_submissions
ADD COLUMN public_display_name TEXT;

ALTER TABLE competition_project_submissions
ADD COLUMN public_bio TEXT;

ALTER TABLE competition_project_submissions
ADD COLUMN portfolio_url TEXT;

ALTER TABLE competition_project_submissions
ADD COLUMN linkedin_url TEXT;

ALTER TABLE competition_project_submissions
ADD COLUMN public_profile_enabled INTEGER NOT NULL DEFAULT 0
CHECK (public_profile_enabled IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_project_submissions_public_leaderboard
ON competition_project_submissions (
    competition_id,
    public_profile_enabled,
    status,
    score DESC,
    submitted_at ASC
);