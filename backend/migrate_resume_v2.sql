-- Migration: structured single-resume model, replacing the old multi-resume
-- "resumes" table and the freeform preferences."primaryResume" field.
--
-- Run this against your EXISTING database (the one migrate_to_accounts.sql
-- was already run against). A brand-new/empty database doesn't need this
-- file — schema.sql already has the new shape built in and never creates
-- the old "resumes" table or "primaryResume" column at all.
--
-- What it does, in order:
--   1. Creates the five new resume_* tables (see backend/resumeSections.js
--      for the section config they're keyed against) — additive only.
--   2. Best-effort backfills each account's old resume content (preferring
--      preferences."primaryResume", falling back to their most recently
--      updated "resumes" row) into resume_raw_import, so nothing already
--      persisted becomes unreachable once the old UI/routes are removed.
--      This is a REFERENCE COPY ONLY — it does not attempt to auto-split
--      the freeform text into structured sections/entries/lines; use the
--      new resume editor's "parse my pasted resume" step for that.
--   3. Re-seeds the demo account with a structured example resume (the old
--      demo-resume-1/2 rows in the "resumes" table won't be touched or
--      re-run, so without this the demo account would otherwise show an
--      empty resume).
--
-- What it deliberately does NOT do: drop or alter the old "resumes" table
-- or preferences."primaryResume" column. They're left in place, unused, for
-- a human to drop later once the backfill above has been spot-checked —
-- consistent with this repo's existing additive-only migration convention
-- (see the comments in migrate_to_accounts.sql).
--
-- Safe to re-run in full: every step below is idempotent.

BEGIN;

-- 1. New tables -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS resume_section_content (
    "accountId" INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    "sectionId" VARCHAR(50) NOT NULL,
    content TEXT,
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY ("accountId", "sectionId")
);

CREATE TABLE IF NOT EXISTS resume_entries (
    id VARCHAR(50) PRIMARY KEY,
    "accountId" INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    "sectionId" VARCHAR(50) NOT NULL,
    heading VARCHAR(255),
    subheading VARCHAR(255),
    "startDate" VARCHAR(50),
    "endDate" VARCHAR(50),
    "order" INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS resume_entries_account_idx ON resume_entries ("accountId");

CREATE TABLE IF NOT EXISTS resume_lines (
    id VARCHAR(50) PRIMARY KEY,
    "accountId" INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    "sectionId" VARCHAR(50) NOT NULL,
    "entryId" VARCHAR(50) REFERENCES resume_entries(id) ON DELETE CASCADE,
    "jobId" VARCHAR(50) REFERENCES jobs(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    "order" INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS resume_lines_account_idx ON resume_lines ("accountId");
CREATE INDEX IF NOT EXISTS resume_lines_job_idx ON resume_lines ("jobId");

CREATE TABLE IF NOT EXISTS resume_raw_import (
    "accountId" INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    content TEXT,
    "importedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resume_generations (
    "jobId" VARCHAR(50) PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
    "accountId" INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    "selectedLineIds" JSONB DEFAULT '[]',
    "renderedMarkdown" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS resume_generations_account_idx ON resume_generations ("accountId");

-- 2. Best-effort backfill into resume_raw_import ---------------------------
-- Guarded: only runs if the old "resumes" table and/or "primaryResume"
-- column still exist (they might already have been dropped by hand on a
-- database this has been run against before and then cleaned up).
DO $$
DECLARE
    has_resumes_table BOOLEAN := to_regclass('public.resumes') IS NOT NULL;
    has_primary_resume_col BOOLEAN := EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'preferences' AND column_name = 'primaryResume'
    );
BEGIN
    -- Prefer preferences.primaryResume when present and non-empty.
    IF has_primary_resume_col THEN
        EXECUTE '
            INSERT INTO resume_raw_import ("accountId", content)
            SELECT p."accountId", p."primaryResume"
            FROM preferences p
            WHERE NULLIF(p."primaryResume", '''') IS NOT NULL
            ON CONFLICT ("accountId") DO NOTHING
        ';
    END IF;

    -- Fall back to the most recently updated "resumes" row for any account
    -- that still has no raw_import row (i.e. primaryResume was empty/unset,
    -- or the column doesn't exist on this database).
    IF has_resumes_table THEN
        EXECUTE '
            INSERT INTO resume_raw_import ("accountId", content)
            SELECT DISTINCT ON (r."accountId") r."accountId", r.content
            FROM resumes r
            WHERE r.content IS NOT NULL AND r.content <> ''''
              AND NOT EXISTS (
                  SELECT 1 FROM resume_raw_import ri WHERE ri."accountId" = r."accountId"
              )
            ORDER BY r."accountId", r."lastUpdated" DESC NULLS LAST
            ON CONFLICT ("accountId") DO NOTHING
        ';
    END IF;
END $$;

-- 3. Re-seed the demo account with a structured example resume -------------
-- Re-runnable: only ever deletes/inserts rows already tagged with the demo
-- account's own id. Never touches your data. No-op if there's no demo
-- account yet.
DO $$
DECLARE
    demo_id INTEGER;
BEGIN
    SELECT id INTO demo_id FROM accounts WHERE "isDemo" = TRUE LIMIT 1;
    IF demo_id IS NULL THEN
        RETURN;
    END IF;

    DELETE FROM resume_generations WHERE "accountId" = demo_id;
    DELETE FROM resume_lines WHERE "accountId" = demo_id;
    DELETE FROM resume_entries WHERE "accountId" = demo_id;
    DELETE FROM resume_section_content WHERE "accountId" = demo_id;

    INSERT INTO resume_section_content ("accountId", "sectionId", content) VALUES
    (demo_id, 'header', 'Jordan Rivera' || E'\n' || 'jordan.rivera@example.com | linkedin.com/in/jordan-rivera-demo | Remote, US'),
    (demo_id, 'summary', 'Product & Growth leader with 6+ years driving analytics-led roadmaps and paid acquisition strategy for B2B SaaS and health tech companies.');

    INSERT INTO resume_entries (id, "accountId", "sectionId", heading, subheading, "startDate", "endDate", "order") VALUES
    ('demo-entry-exp-1', demo_id, 'experience', 'Senior Product Manager', 'Meridian Software', '2022', '2026', 0),
    ('demo-entry-exp-2', demo_id, 'experience', 'Growth Marketing Manager', 'Fenwick Co', '2019', '2022', 1),
    ('demo-entry-edu-1', demo_id, 'education', 'B.A. Economics', 'University of Washington', '2015', '2019', 0);

    INSERT INTO resume_lines (id, "accountId", "sectionId", "entryId", "jobId", content, "order") VALUES
    ('demo-line-exp1-1', demo_id, 'experience', 'demo-entry-exp-1', NULL, 'Led a 4-person pod shipping analytics features; grew paid conversion 22%.', 0),
    ('demo-line-exp1-2', demo_id, 'experience', 'demo-entry-exp-1', NULL, 'Partnered with design and engineering to ship a self-serve reporting suite used by 500+ customers.', 1),
    ('demo-line-exp2-1', demo_id, 'experience', 'demo-entry-exp-2', NULL, 'Owned paid acquisition budget of $2M/yr across Google and LinkedIn Ads.', 0),
    ('demo-line-exp2-2', demo_id, 'experience', 'demo-entry-exp-2', NULL, 'Built a lifecycle email program that lifted trial-to-paid conversion 15%.', 1),
    ('demo-line-edu1-1', demo_id, 'education', 'demo-entry-edu-1', NULL, 'Graduated with honors.', 0),
    ('demo-line-skill-1', demo_id, 'skills', NULL, NULL, 'Roadmapping', 0),
    ('demo-line-skill-2', demo_id, 'skills', NULL, NULL, 'SQL', 1),
    ('demo-line-skill-3', demo_id, 'skills', NULL, NULL, 'A/B testing', 2),
    ('demo-line-skill-4', demo_id, 'skills', NULL, NULL, 'Stakeholder management', 3);

    -- Example of a job-scoped additional line, shown only when tailoring
    -- for demo-job-1 (Senior Product Manager @ Northwind Analytics, seeded
    -- in migrate_to_accounts.sql) — demonstrates the per-job additional
    -- lines feature out of the box.
    IF EXISTS (SELECT 1 FROM jobs WHERE id = 'demo-job-1' AND "accountId" = demo_id) THEN
        INSERT INTO resume_lines (id, "accountId", "sectionId", "entryId", "jobId", content, "order") VALUES
        ('demo-line-exp1-job1', demo_id, 'experience', 'demo-entry-exp-1', 'demo-job-1', 'Shipped a cohort-based retention dashboard now used company-wide — directly relevant to Northwind''s core reporting product.', 2)
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

COMMIT;
