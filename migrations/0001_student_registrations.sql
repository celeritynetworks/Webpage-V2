PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS student_registrations (
  id TEXT PRIMARY KEY NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  course TEXT NOT NULL,
  training_mode TEXT NOT NULL CHECK (training_mode IN ('Virtual', 'Onsite')),
  education TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'enrolled', 'closed')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_student_registrations_created_at
  ON student_registrations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_registrations_email
  ON student_registrations(email);

CREATE TABLE IF NOT EXISTS registration_rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_registration_rate_limits_ip_time
  ON registration_rate_limits(ip_hash, created_at);
