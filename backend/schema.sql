-- Get the Job — database schema
-- Run this once against your Cloud SQL PostgreSQL instance after creating it.

CREATE TABLE IF NOT EXISTS jobs (
    id VARCHAR(50) PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS notes (
    id VARCHAR(50) PRIMARY KEY,
    "jobId" VARCHAR(50) REFERENCES jobs(id) ON DELETE CASCADE,
    type VARCHAR(50),
    title VARCHAR(255),
    content TEXT,
    date TIMESTAMP,
    "isAiGenerated" BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS resumes (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255),
    content TEXT,
    "targetRole" VARCHAR(255),
    "lastUpdated" TIMESTAMP
);

CREATE TABLE IF NOT EXISTS context_resources (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255),
    content TEXT,
    "dateAdded" TIMESTAMP
);

CREATE TABLE IF NOT EXISTS preferences (
    id INT PRIMARY KEY DEFAULT 1,
    "petalsExercise" TEXT,
    "linkedInProfile" TEXT,
    "primaryResume" TEXT,
    CONSTRAINT single_row CHECK (id = 1)
);
-- Migrations:
-- ALTER TABLE preferences ADD COLUMN IF NOT EXISTS "linkedInProfile" TEXT;
-- ALTER TABLE preferences ADD COLUMN IF NOT EXISTS "primaryResume" TEXT;
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source VARCHAR(255);

CREATE TABLE IF NOT EXISTS journal_entries (
    id VARCHAR(50) PRIMARY KEY,
    date DATE NOT NULL,
    content TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interview_questions (
    id VARCHAR(50) PRIMARY KEY,
    question TEXT NOT NULL,
    response TEXT,
    category VARCHAR(100) DEFAULT 'General',
    "dateAdded" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_analyses (
    id VARCHAR(50) PRIMARY KEY,
    "jobId" VARCHAR(50) NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    score INTEGER,
    pros JSONB DEFAULT '[]',
    cons JSONB DEFAULT '[]',
    "fitReason" TEXT,
    "resumeEdits" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
-- Migration: CREATE TABLE IF NOT EXISTS job_analyses (...) — run the block above on existing instances.
