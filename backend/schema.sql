-- Get the Job — database schema
-- Run this once against your Cloud SQL PostgreSQL instance after creating it.
--
-- If you already have an existing database (jobs/notes/etc. already
-- populated), do NOT just re-run this file — use backend/migrate_to_accounts.sql
-- instead, which adds the accounts table and safely backfills existing rows.

CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    "displayName" VARCHAR(255),
    "isDemo" BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
    id VARCHAR(50) PRIMARY KEY,
    "accountId" INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    title VARCHAR(255),
    company VARCHAR(255),
    status VARCHAR(50),
    url TEXT,
    description TEXT,
    "dateAdded" TIMESTAMP,
    "matchScore" INT,
    "matchAnalysis" TEXT,
    location VARCHAR(255),
    tags JSONB DEFAULT '[]',
    "dateApplied" DATE,
    "customFields" JSONB DEFAULT '{}',
    source VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS jobs_account_idx ON jobs ("accountId");

CREATE TABLE IF NOT EXISTS notes (
    id VARCHAR(50) PRIMARY KEY,
    "accountId" INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    "jobId" VARCHAR(50) REFERENCES jobs(id) ON DELETE CASCADE,
    type VARCHAR(50),
    title VARCHAR(255),
    content TEXT,
    date TIMESTAMP,
    "isAiGenerated" BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS notes_account_idx ON notes ("accountId");

CREATE TABLE IF NOT EXISTS resumes (
    id VARCHAR(50) PRIMARY KEY,
    "accountId" INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(255),
    content TEXT,
    "targetRole" VARCHAR(255),
    "lastUpdated" TIMESTAMP
);
CREATE INDEX IF NOT EXISTS resumes_account_idx ON resumes ("accountId");

CREATE TABLE IF NOT EXISTS context_resources (
    id VARCHAR(50) PRIMARY KEY,
    "accountId" INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    title VARCHAR(255),
    content TEXT,
    "dateAdded" TIMESTAMP
);
CREATE INDEX IF NOT EXISTS context_resources_account_idx ON context_resources ("accountId");

-- One preferences row per account (was a singleton id=1 row before accounts existed).
CREATE TABLE IF NOT EXISTS preferences (
    "accountId" INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    "petalsExercise" TEXT,
    "linkedInProfile" TEXT,
    "primaryResume" TEXT
);

CREATE TABLE IF NOT EXISTS journal_entries (
    id VARCHAR(50) PRIMARY KEY,
    "accountId" INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    content TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS journal_entries_account_idx ON journal_entries ("accountId");

CREATE TABLE IF NOT EXISTS interview_questions (
    id VARCHAR(50) PRIMARY KEY,
    "accountId" INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    response TEXT,
    category VARCHAR(100) DEFAULT 'General',
    "dateAdded" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS interview_questions_account_idx ON interview_questions ("accountId");

CREATE TABLE IF NOT EXISTS job_analyses (
    id VARCHAR(50) PRIMARY KEY,
    "accountId" INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    "jobId" VARCHAR(50) NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    score INTEGER,
    pros JSONB DEFAULT '[]',
    cons JSONB DEFAULT '[]',
    "fitReason" TEXT,
    "resumeEdits" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS job_analyses_account_idx ON job_analyses ("accountId");

-- Migrations (for reference — running this file fresh already includes these):
-- ALTER TABLE preferences ADD COLUMN IF NOT EXISTS "linkedInProfile" TEXT;
-- ALTER TABLE preferences ADD COLUMN IF NOT EXISTS "primaryResume" TEXT;
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source VARCHAR(255);
-- CREATE TABLE IF NOT EXISTS job_analyses (...) — run the block above on existing instances.
--
-- Accounts migration (existing databases only): see backend/migrate_to_accounts.sql.
-- Do not hand-run the "accountId" columns above against a database that
-- already has data in jobs/notes/resumes/etc. — that script backfills them
-- safely and only then adds the NOT NULL constraint.
