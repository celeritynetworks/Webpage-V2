ALTER TABLE competition_project_submissions
ADD COLUMN ownership_confirmed INTEGER NOT NULL DEFAULT 0
CHECK (ownership_confirmed IN (0, 1));

ALTER TABLE competition_project_submissions
ADD COLUMN public_repository_confirmed INTEGER NOT NULL DEFAULT 0
CHECK (public_repository_confirmed IN (0, 1));

ALTER TABLE competition_project_submissions
ADD COLUMN declaration_version TEXT;

ALTER TABLE competition_project_submissions
ADD COLUMN declarations_accepted_at INTEGER;
