
PRAGMA foreign_keys = ON;

-- ==========================================
-- 1. INDUSTRIES
-- ==========================================

CREATE TABLE IF NOT EXISTS industries (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at INTEGER NOT NULL
);

-- Initial industry categories.
-- New industries can be added later through the admin portal.

INSERT OR IGNORE INTO industries
  (id, name, slug, description, created_at)
VALUES
  ('healthcare', 'Healthcare', 'healthcare',
   'Hospital, medical, public health and patient datasets.', unixepoch()),
  ('finance', 'Finance', 'finance',
   'Banking, accounting, financial services and investment datasets.', unixepoch()),
  ('agriculture', 'Agriculture', 'agriculture',
   'Crop production, livestock, agricultural research and food systems.', unixepoch()),
  ('retail', 'Retail and Sales', 'retail',
   'Sales, inventory, customer behaviour and e-commerce datasets.', unixepoch()),
  ('education', 'Education', 'education',
   'Student performance, learning, school administration and education datasets.', unixepoch());


-- ==========================================
-- 2. DATASETS
-- ==========================================

CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY NOT NULL,

  industry_id TEXT NOT NULL,

  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,

  difficulty TEXT NOT NULL
    CHECK (difficulty IN (
      'Beginner',
      'Intermediate',
      'Professional'
    )),

  file_key TEXT UNIQUE,
  file_name TEXT,
  file_format TEXT
    CHECK (
      file_format IS NULL OR
      file_format IN ('csv', 'xlsx', 'xls', 'zip', 'json', 'parquet')
    ),

  file_size_bytes INTEGER
    CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),

  record_count INTEGER
    CHECK (record_count IS NULL OR record_count >= 0),

  column_count INTEGER
    CHECK (column_count IS NULL OR column_count >= 0),

  preview_image_key TEXT,

  learning_objectives TEXT,
  tags TEXT,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),

  download_count INTEGER NOT NULL DEFAULT 0
    CHECK (download_count >= 0),

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,

  FOREIGN KEY (industry_id)
    REFERENCES industries(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);


-- ==========================================
-- 3. COMPETITIONS
-- ==========================================

CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY NOT NULL,

  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,

  industry_id TEXT,

  difficulty TEXT NOT NULL
    CHECK (difficulty IN (
      'Beginner',
      'Intermediate',
      'Professional'
    )),

  instructions TEXT NOT NULL,

  dataset_file_key TEXT,
  dataset_file_name TEXT,
  dataset_file_format TEXT
    CHECK (
      dataset_file_format IS NULL OR
      dataset_file_format IN ('csv', 'xlsx', 'xls', 'zip', 'json', 'parquet')
    ),

  dataset_file_size_bytes INTEGER,
  record_count INTEGER,

  registration_opens_at INTEGER,
  registration_closes_at INTEGER,

  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'upcoming',
      'active',
      'completed',
      'archived'
    )),

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  FOREIGN KEY (industry_id)
    REFERENCES industries(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,

  CHECK (ends_at > starts_at)
);


-- ==========================================
-- 4. COMPETITION SUBMISSIONS
-- ==========================================

CREATE TABLE IF NOT EXISTS competition_submissions (
  id TEXT PRIMARY KEY NOT NULL,

  competition_id TEXT NOT NULL,

  participant_name TEXT NOT NULL,
  participant_email TEXT NOT NULL,

  submission_file_key TEXT NOT NULL UNIQUE,
  submission_file_name TEXT NOT NULL,
  submission_file_format TEXT NOT NULL
    CHECK (
      submission_file_format IN ('csv', 'xlsx', 'xls', 'zip', 'pdf')
    ),

  file_size_bytes INTEGER NOT NULL
    CHECK (file_size_bytes > 0),

  notes TEXT,

  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN (
      'submitted',
      'reviewing',
      'shortlisted',
      'winner',
      'not_selected'
    )),

  score REAL,
  feedback TEXT,

  submitted_at INTEGER NOT NULL,
  reviewed_at INTEGER,

  FOREIGN KEY (competition_id)
    REFERENCES competitions(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);


-- ==========================================
-- 5. PERFORMANCE INDEXES
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_datasets_industry
  ON datasets(industry_id);

CREATE INDEX IF NOT EXISTS idx_datasets_difficulty
  ON datasets(difficulty);

CREATE INDEX IF NOT EXISTS idx_datasets_status
  ON datasets(status);

CREATE INDEX IF NOT EXISTS idx_datasets_created
  ON datasets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_competitions_status
  ON competitions(status);

CREATE INDEX IF NOT EXISTS idx_competitions_dates
  ON competitions(starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_competitions_industry
  ON competitions(industry_id);

CREATE INDEX IF NOT EXISTS idx_submissions_competition
  ON competition_submissions(competition_id);

CREATE INDEX IF NOT EXISTS idx_submissions_email
  ON competition_submissions(participant_email);

CREATE INDEX IF NOT EXISTS idx_submissions_status
  ON competition_submissions(status);
