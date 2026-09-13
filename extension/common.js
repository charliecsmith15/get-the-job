// Shared constants and helpers used by both the popup and the options page.

// Mirrors the default in backend/frontend server.js (`ALLOWED_EMAILS`), so a
// fresh install matches the web app's default allowlist out of the box.
export const DEFAULT_ALLOWED_EMAILS = 'charlie@workbench-data.com,rankin@workbench-data.com,charlie@charliecsmith.com,ccsmith1534@gmail.com';

export const STORAGE_KEYS = {
  backendUrl: 'gtj_backendUrl',
  allowedEmails: 'gtj_allowedEmails',
};

export const JOB_STATUSES = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected'];

const SOURCE_ALIASES = [
  [/linkedin/i,   'LinkedIn'],
  [/indeed/i,     'Indeed'],
  [/glassdoor/i,  'Glassdoor'],
  [/handshake/i,  'Handshake'],
  [/ziprecruiter/i, 'ZipRecruiter'],
  [/builtin/i,    'Built In'],
  [/lever/i,      'Lever'],
  [/greenhouse/i, 'Greenhouse'],
  [/workday/i,    'Workday'],
  [/ashby/i,      'Ashby'],
];

export function normalizeSource(raw) {
  if (!raw) return '';
  const trimmed = raw.trim();
  const match = SOURCE_ALIASES.find(([pattern]) => pattern.test(trimmed));
  return match ? match[1] : trimmed;
}

export async function getSettings() {
  const stored = await chrome.storage.sync.get({
    [STORAGE_KEYS.backendUrl]: '',
    [STORAGE_KEYS.allowedEmails]: DEFAULT_ALLOWED_EMAILS,
  });
  return {
    backendUrl: stored[STORAGE_KEYS.backendUrl].replace(/\/$/, ''),
    allowedEmails: stored[STORAGE_KEYS.allowedEmails]
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  };
}

export function originPatternFor(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

function randomId() {
  return Math.random().toString(36).substring(2, 11);
}

// Builds a Job payload matching the shape backend/schema.sql's `jobs` table
// and POST /api/jobs expect (see frontend/types.ts `Job`).
export function buildJobPayload(fields) {
  return {
    id: randomId(),
    title: fields.title,
    company: fields.company,
    status: fields.status,
    url: fields.url,
    description: fields.description || '',
    dateAdded: new Date().toISOString(),
    location: fields.location || undefined,
    tags: fields.tags,
    dateApplied: fields.status === 'Applied' && fields.dateApplied ? fields.dateApplied : undefined,
    customFields: {},
    source: fields.source || undefined,
  };
}

export async function createJob(backendUrl, job, idToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  const res = await fetch(`${backendUrl}/jobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify(job),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Backend returned ${res.status}${text ? `: ${text}` : ''}`);
  }
  return job;
}
