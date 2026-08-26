-- One-time migration: add per-account data isolation to an EXISTING
-- database that predates the accounts table (e.g. your current production
-- jobsearch database). A brand-new/empty database doesn't need this file —
-- just run schema.sql, which already has the accounts shape built in.
--
-- BEFORE RUNNING:
--   1. Back up the database first (e.g. `gcloud sql export sql ...`).
--   2. Edit the two email addresses in the DO block just below: your real
--      Google account, and the dedicated Google account you'll sign in
--      with to show the demo (create that account first if you haven't).
--   3. Run this against your EXISTING database with data already in it.
--
-- What it does, in order:
--   1. Creates the accounts table.
--   2. Creates your account and a separate demo account.
--   3. Adds an "accountId" column to every table.
--   4. Backfills every existing row (all of it — today's single shared
--      dataset) to YOUR account, so nothing you already have changes hands.
--   5. Locks "accountId" down to NOT NULL + a foreign key + an index.
--   6. Converts `preferences` from a singleton id=1 row to one row per
--      account.
--   7. Seeds the demo account with sample jobs/notes/resumes/etc. so it has
--      something to show — without ever touching your real data.
--
-- Safe to re-run in full: steps 1–4 and 7 are naturally idempotent, and
-- steps 5–6 are wrapped so re-running just skips constraints that already
-- exist.

BEGIN;

DO $$ BEGIN
  PERFORM set_config('app.charlie_email', 'charlie@workbench-data.com', false);
  PERFORM set_config('app.demo_email', 'REPLACE_WITH_YOUR_DEMO_ACCOUNT_EMAIL@gmail.com', false);
END $$;

-- 1. Accounts table -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    "displayName" VARCHAR(255),
    "isDemo" BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Seed the two accounts ----------------------------------------------------
INSERT INTO accounts (email, "displayName")
VALUES (current_setting('app.charlie_email'), 'Charlie')
ON CONFLICT (email) DO NOTHING;

INSERT INTO accounts (email, "displayName", "isDemo")
VALUES (current_setting('app.demo_email'), 'Demo Account', TRUE)
ON CONFLICT (email) DO NOTHING;

-- 3. Add accountId columns (nullable for now; backfilled next, locked down after)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS "accountId" INTEGER;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS "accountId" INTEGER;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS "accountId" INTEGER;
ALTER TABLE context_resources ADD COLUMN IF NOT EXISTS "accountId" INTEGER;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS "accountId" INTEGER;
ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS "accountId" INTEGER;
ALTER TABLE job_analyses ADD COLUMN IF NOT EXISTS "accountId" INTEGER;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS "accountId" INTEGER;

-- 4. Backfill every existing row to YOUR account ------------------------------
UPDATE jobs SET "accountId" = (SELECT id FROM accounts WHERE email = current_setting('app.charlie_email')) WHERE "accountId" IS NULL;
UPDATE notes SET "accountId" = (SELECT id FROM accounts WHERE email = current_setting('app.charlie_email')) WHERE "accountId" IS NULL;
UPDATE resumes SET "accountId" = (SELECT id FROM accounts WHERE email = current_setting('app.charlie_email')) WHERE "accountId" IS NULL;
UPDATE context_resources SET "accountId" = (SELECT id FROM accounts WHERE email = current_setting('app.charlie_email')) WHERE "accountId" IS NULL;
UPDATE journal_entries SET "accountId" = (SELECT id FROM accounts WHERE email = current_setting('app.charlie_email')) WHERE "accountId" IS NULL;
UPDATE interview_questions SET "accountId" = (SELECT id FROM accounts WHERE email = current_setting('app.charlie_email')) WHERE "accountId" IS NULL;
UPDATE job_analyses SET "accountId" = (SELECT id FROM accounts WHERE email = current_setting('app.charlie_email')) WHERE "accountId" IS NULL;
UPDATE preferences SET "accountId" = (SELECT id FROM accounts WHERE email = current_setting('app.charlie_email')) WHERE "accountId" IS NULL;

-- 5. Lock accountId down: NOT NULL + foreign key + index ----------------------
ALTER TABLE jobs ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE notes ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE resumes ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE context_resources ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE journal_entries ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE interview_questions ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE job_analyses ALTER COLUMN "accountId" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE jobs ADD CONSTRAINT jobs_account_fkey FOREIGN KEY ("accountId") REFERENCES accounts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE notes ADD CONSTRAINT notes_account_fkey FOREIGN KEY ("accountId") REFERENCES accounts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE resumes ADD CONSTRAINT resumes_account_fkey FOREIGN KEY ("accountId") REFERENCES accounts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE context_resources ADD CONSTRAINT context_resources_account_fkey FOREIGN KEY ("accountId") REFERENCES accounts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_account_fkey FOREIGN KEY ("accountId") REFERENCES accounts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE interview_questions ADD CONSTRAINT interview_questions_account_fkey FOREIGN KEY ("accountId") REFERENCES accounts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE job_analyses ADD CONSTRAINT job_analyses_account_fkey FOREIGN KEY ("accountId") REFERENCES accounts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS jobs_account_idx ON jobs ("accountId");
CREATE INDEX IF NOT EXISTS notes_account_idx ON notes ("accountId");
CREATE INDEX IF NOT EXISTS resumes_account_idx ON resumes ("accountId");
CREATE INDEX IF NOT EXISTS context_resources_account_idx ON context_resources ("accountId");
CREATE INDEX IF NOT EXISTS journal_entries_account_idx ON journal_entries ("accountId");
CREATE INDEX IF NOT EXISTS interview_questions_account_idx ON interview_questions ("accountId");
CREATE INDEX IF NOT EXISTS job_analyses_account_idx ON job_analyses ("accountId");

-- 6. Convert preferences from a singleton id=1 row to one row per account ----
ALTER TABLE preferences DROP CONSTRAINT IF EXISTS single_row;
ALTER TABLE preferences ALTER COLUMN "accountId" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE preferences DROP CONSTRAINT preferences_pkey;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE preferences ADD CONSTRAINT preferences_pkey PRIMARY KEY ("accountId");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE preferences ADD CONSTRAINT preferences_account_fkey FOREIGN KEY ("accountId") REFERENCES accounts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE preferences DROP COLUMN IF EXISTS id;

-- 7. Seed the demo account with sample data -----------------------------------
-- Re-runnable: only ever deletes/inserts rows already tagged with the demo
-- account's own id, identified by fixed demo-* ids. Never touches your data.
DO $$
DECLARE
  demo_id INTEGER;
BEGIN
  SELECT id INTO demo_id FROM accounts WHERE email = current_setting('app.demo_email');

  DELETE FROM job_analyses WHERE "accountId" = demo_id;
  DELETE FROM notes WHERE "accountId" = demo_id;
  DELETE FROM jobs WHERE "accountId" = demo_id;
  DELETE FROM resumes WHERE "accountId" = demo_id;
  DELETE FROM context_resources WHERE "accountId" = demo_id;
  DELETE FROM preferences WHERE "accountId" = demo_id;
  DELETE FROM journal_entries WHERE "accountId" = demo_id;
  DELETE FROM interview_questions WHERE "accountId" = demo_id;

  INSERT INTO jobs (id, "accountId", title, company, status, url, description, "dateAdded", "matchScore", "matchAnalysis", location, tags, "dateApplied", "customFields", source) VALUES
  ('demo-job-1', demo_id, 'Senior Product Manager', 'Northwind Analytics', 'Interviewing', 'https://example.com/jobs/northwind-spm', 'Own the roadmap for Northwind''s core reporting product, partnering with eng and design to ship data-driven features for mid-market customers.', NOW() - INTERVAL '18 days', 88, 'Strong overlap with your B2B analytics background; the team is hiring for someone who can run discovery independently.', 'Remote (US)', '["Product", "SaaS", "Analytics"]', '2026-08-10', '{}', 'LinkedIn'),
  ('demo-job-2', demo_id, 'Growth Marketing Lead', 'Baseline Health', 'Applied', 'https://example.com/jobs/baseline-growth', 'Lead acquisition and lifecycle marketing for a Series B digital health startup, with a focus on paid channels and retention experiments.', NOW() - INTERVAL '9 days', 74, 'Good adjacency but less direct healthcare experience than they typically screen for — worth addressing in the cover letter.', 'Boston, MA', '["Marketing", "Growth", "Healthcare"]', '2026-08-19', '{}', 'Company site'),
  ('demo-job-3', demo_id, 'Staff Software Engineer, Platform', 'Ferro Systems', 'Saved', 'https://example.com/jobs/ferro-staff-eng', 'Design and build the internal platform team''s next-generation deployment pipeline serving 40+ product teams.', NOW() - INTERVAL '4 days', 65, 'Compelling scope, but the listing suggests heavy on-call — confirm expectations before applying.', 'Austin, TX', '["Engineering", "Platform", "Infrastructure"]', NULL, '{}', 'Referral'),
  ('demo-job-4', demo_id, 'Customer Success Manager', 'Lumen Robotics', 'Offer', 'https://example.com/jobs/lumen-csm', 'Manage a portfolio of enterprise robotics customers through onboarding, renewal, and expansion.', NOW() - INTERVAL '32 days', 91, 'Excellent fit — mirrors your prior enterprise CS role almost exactly, and comp is above your target band.', 'Chicago, IL', '["Customer Success", "Enterprise"]', '2026-07-28', '{}', 'Indeed'),
  ('demo-job-5', demo_id, 'Data Analyst, Revenue Operations', 'Northwind Analytics', 'Rejected', 'https://example.com/jobs/northwind-revops', 'Support the RevOps team with pipeline reporting, forecasting models, and ad hoc analysis for sales leadership.', NOW() - INTERVAL '45 days', 58, 'Passed after final round — team went with an internal transfer candidate.', 'Remote (US)', '["Data", "RevOps"]', '2026-07-15', '{}', 'LinkedIn'),
  ('demo-job-6', demo_id, 'Technical Program Manager', 'Ferro Systems', 'Saved', 'https://example.com/jobs/ferro-tpm', 'Coordinate cross-functional delivery for a multi-quarter infrastructure migration.', NOW() - INTERVAL '2 days', 70, 'Solid match for your program management background; scope is broader than your last TPM role.', 'Austin, TX', '["Program Management", "Infrastructure"]', NULL, '{}', 'Handshake');

  INSERT INTO notes (id, "accountId", "jobId", type, title, content, date, "isAiGenerated") VALUES
  ('demo-note-1', demo_id, 'demo-job-1', 'Interview', 'Recruiter screen recap', 'Spoke with recruiter Dana for 30 min. Team is 6 PMs, reports to VP Product. Next step is a portfolio review with the hiring manager.', NOW() - INTERVAL '15 days', FALSE),
  ('demo-note-2', demo_id, 'demo-job-1', 'Research', 'Company research', 'Northwind raised a $40M Series C last year. Main competitor is a company called Metrio — worth asking how they differentiate.', NOW() - INTERVAL '17 days', TRUE),
  ('demo-note-3', demo_id, 'demo-job-4', 'Interview', 'Offer call notes', 'Verbal offer: $128k base + bonus + equity refresh. Asked for two business days to review before responding.', NOW() - INTERVAL '5 days', FALSE),
  ('demo-note-4', demo_id, 'demo-job-2', 'General', 'Application follow-up', 'Sent a follow-up note to the hiring manager on day 7 referencing their recent product launch blog post.', NOW() - INTERVAL '2 days', FALSE);

  INSERT INTO resumes (id, "accountId", name, content, "targetRole", "lastUpdated") VALUES
  ('demo-resume-1', demo_id, 'General — Product & Growth', 'Jordan Rivera\nProduct & Growth Leader\n\nExperience\n- Senior PM, Meridian Software (2022–2026): Led a 4-person pod shipping analytics features; grew paid conversion 22%.\n- Growth Marketing Manager, Fenwick Co (2019–2022): Owned paid acquisition budget of $2M/yr.\n\nSkills: Roadmapping, SQL, A/B testing, stakeholder management', 'Product Manager', NOW() - INTERVAL '20 days'),
  ('demo-resume-2', demo_id, 'Tailored — Customer Success roles', 'Jordan Rivera\nCustomer Success & Account Management\n\nExperience\n- Senior CSM, Meridian Software: Managed $3M enterprise book, 98% net revenue retention.\n\nSkills: Renewals, QBRs, cross-sell strategy, Salesforce', 'Customer Success Manager', NOW() - INTERVAL '6 days');

  INSERT INTO context_resources (id, "accountId", title, content, "dateAdded") VALUES
  ('demo-context-1', demo_id, 'Target companies list', 'Northwind Analytics, Baseline Health, Ferro Systems, Lumen Robotics, Vantage Cloud, Orbital Data — mid-market B2B SaaS and health tech, Series B–D, remote-friendly.', NOW() - INTERVAL '40 days'),
  ('demo-context-2', demo_id, 'Salary research notes', 'Senior PM comp in target cities benchmarks $145k–$175k base per recent postings; CSM roles trend $95k–$120k base + variable.', NOW() - INTERVAL '25 days');

  INSERT INTO preferences ("accountId", "petalsExercise", "linkedInProfile", "primaryResume") VALUES
  (demo_id, 'Energized by: 0–1 product work, customer conversations, mentoring.\nDrained by: heavy process overhead, pure maintenance work.', 'linkedin.com/in/jordan-rivera-demo', 'demo-resume-1');

  INSERT INTO journal_entries (id, "accountId", date, content, created_at) VALUES
  ('demo-journal-1', demo_id, CURRENT_DATE - INTERVAL '3 days', 'Good week — landed the Lumen Robotics offer and have the Northwind portfolio review scheduled. Feeling optimistic about the pipeline.', NOW() - INTERVAL '3 days'),
  ('demo-journal-2', demo_id, CURRENT_DATE - INTERVAL '10 days', 'Baseline Health application took longer than expected; their portal kept timing out. Followed up directly with the hiring manager on LinkedIn instead.', NOW() - INTERVAL '10 days');

  INSERT INTO interview_questions (id, "accountId", question, response, category, "dateAdded") VALUES
  ('demo-iq-1', demo_id, 'Tell me about a time you had to say no to a stakeholder.', 'Used the Fenwick paid-channel example — pushed back on a VP request to launch a channel with no attribution plan, proposed a smaller test instead.', 'Behavioral', NOW() - INTERVAL '15 days'),
  ('demo-iq-2', demo_id, 'How do you prioritize a roadmap with limited engineering capacity?', 'Walk through the RICE framework example from the Meridian analytics feature prioritization.', 'Product', NOW() - INTERVAL '15 days'),
  ('demo-iq-3', demo_id, 'Why are you leaving your current role?', 'Focus on seeking bigger scope and more ownership over 0-1 work, not on anything negative about the current team.', 'General', NOW() - INTERVAL '8 days');

  INSERT INTO job_analyses (id, "accountId", "jobId", score, pros, cons, "fitReason", "resumeEdits", "createdAt") VALUES
  ('demo-analysis-1', demo_id, 'demo-job-1', 88, '["Directly relevant analytics domain", "Comp band matches target", "Team size fits stated preference for smaller pods"]', '["Requires occasional travel to HQ", "No mention of remote stipend"]', 'Skills and domain experience line up closely with the role''s core responsibilities.', 'Lead with the Meridian analytics feature work and quantify the 22% conversion lift in the summary.', NOW() - INTERVAL '17 days'),
  ('demo-analysis-2', demo_id, 'demo-job-4', 91, '["Near-exact match to prior CSM scope", "Compensation above target", "Verbal offer already extended"]', '["Book of business is larger than previously managed"]', 'Prior enterprise CS experience maps almost one-to-one onto this role''s requirements.', 'Emphasize the $3M book and 98% NRR figures near the top of the resume.', NOW() - INTERVAL '6 days');
END $$;

COMMIT;
