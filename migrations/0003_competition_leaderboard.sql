PRAGMA foreign_keys = ON;

-- Public leaderboard and participant profile information.
ALTER TABLE competition_submissions
ADD COLUMN public_display_name TEXT;

ALTER TABLE competition_submissions
ADD COLUMN public_bio TEXT;

ALTER TABLE competition_submissions
ADD COLUMN profile_image_key TEXT;

ALTER TABLE competition_submissions
ADD COLUMN portfolio_url TEXT;

ALTER TABLE competition_submissions
ADD COLUMN linkedin_url TEXT;

ALTER TABLE competition_submissions
ADD COLUMN public_profile_enabled INTEGER NOT NULL DEFAULT 0
CHECK (public_profile_enabled IN (0, 1));

-- Efficient ranking by verified competition score.
CREATE INDEX IF NOT EXISTS idx_submissions_leaderboard
ON competition_submissions(competition_id, score DESC, submitted_at ASC);
