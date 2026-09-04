-- Migration: job status history + notification email
-- Run against existing Cloud SQL instances.

CREATE TABLE IF NOT EXISTS job_status_history (
    id           VARCHAR(50) PRIMARY KEY,
    "jobId"      VARCHAR(50) NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    "accountId"  INTEGER NOT NULL,
    "fromStatus" VARCHAR(50),
    "toStatus"   VARCHAR(50) NOT NULL,
    "changedAt"  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS job_status_history_account_idx ON job_status_history ("accountId", "changedAt");

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS notification_email VARCHAR(255);

-- Set charlie's digest destination
UPDATE accounts SET notification_email = 'charlie@charliecsmith.com' WHERE email = 'charlie@workbench-data.com';
