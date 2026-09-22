
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import fetch from 'node-fetch';
import rateLimit from 'express-rate-limit';
import { WebSocketServer, WebSocket } from 'ws';
import { RESUME_SECTIONS, TOTAL_CHAR_BUDGET, getSection } from './resumeSections.js';
import { runWeeklyDigest } from './digest.js';

const app = express();
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true); // allow server-to-server / curl
        const allowed = origin.endsWith('.run.app') || origin === 'https://jobs.charliecsmith.com' || origin === 'http://localhost:8080' || origin === 'http://localhost:3000'
            || origin.startsWith('chrome-extension://'); // Get the Job companion Chrome extension
        callback(allowed ? null : new Error('CORS'), allowed);
    }
}));
app.use(express.json({limit: process?.env?.API_PAYLOAD_MAX_SIZE || "7mb"}));

const PORT = process?.env?.PORT || process?.env?.API_BACKEND_PORT || 8080;
const API_BACKEND_HOST = process?.env?.API_BACKEND_HOST || "0.0.0.0";

const GOOGLE_CLOUD_LOCATION = process?.env?.GOOGLE_CLOUD_LOCATION;
const GOOGLE_CLOUD_PROJECT = process?.env?.GOOGLE_CLOUD_PROJECT;
if (!GOOGLE_CLOUD_PROJECT || !GOOGLE_CLOUD_LOCATION) {
  console.error("Error: Environment variables GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION must be set.");
  process.exit(1);
}
const PROXY_HEADER = process?.env?.PROXY_HEADER;
if (!PROXY_HEADER) {
  console.error("Error: Environment variables PROXY_HEADER must be set.");
  process.exit(1);
}

// GOOGLE_CLIENT_ID is the OAuth client ID used to verify the Google ID
// tokens the frontend's Sign-In button issues (see the accounts/auth
// section below). Must match the frontend's GOOGLE_CLIENT_ID exactly.
if (!process.env.GOOGLE_CLIENT_ID) {
  console.error("Error: Environment variable GOOGLE_CLIENT_ID must be set.");
  process.exit(1);
}

app.set('trust proxy', 1 /* number of proxies between user and server */);

// IMPORTANT: Vertex AI Studio Rate Limiting
// This rate limiting configuration protects your backend APIs from abuse.
// Removing it exposes your service to DoS attacks and unexpected costs.
const proxyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Set ratelimit window at 15min (in ms)
    max: 100, // Limit each IP to 100 requests per window 
    standardHeaders: true, // Return rate limit info in the "RateLimit-*" headers
    legacyHeaders: false, // no "X-RateLimit-*" headers
    message: {
      error: 'Too many requests',
      message: 'You have exceed the request limit, please try again later.'
    },
});
// Apply the rate limiter to the /api-proxy route before the main proxy logic
app.use('/api-proxy', proxyLimiter);

const API_CLIENT_MAP = [
 {
    name: "VertexGenAi:generateContent",
    patternForProxy: "https://aiplatform.googleapis.com/{{version}}/publishers/google/models/{{model}}:generateContent",
    getApiEndpoint: (context, params) => {
      return `https://aiplatform.clients6.google.com/${params['version']}/projects/${context.projectId}/locations/${context.region}/publishers/google/models/${params['model']}:generateContent`;
    },
    isStreaming: false,
    transformFn: null,
  },
 {
    name: "VertexGenAi:predict",
    patternForProxy: "https://aiplatform.googleapis.com/{{version}}/publishers/google/models/{{model}}:predict",
    getApiEndpoint: (context, params) => {
      return `https://aiplatform.clients6.google.com/${params['version']}/projects/${context.projectId}/locations/${context.region}/publishers/google/models/${params['model']}:predict`;
    },
    isStreaming: false,
    transformFn: null,
  },
 {
    name: "VertexGenAi:streamGenerateContent",
    patternForProxy: "https://aiplatform.googleapis.com/{{version}}/publishers/google/models/{{model}}:streamGenerateContent",
    getApiEndpoint: (context, params) => {
      return `https://aiplatform.clients6.google.com/${params['version']}/projects/${context.projectId}/locations/${context.region}/publishers/google/models/${params['model']}:streamGenerateContent`;
    },
    isStreaming: true,
    transformFn: (response) => {
        let normalizedResponse = response.trim();
        while (normalizedResponse.startsWith(',') || normalizedResponse.startsWith('[')) {
          normalizedResponse = normalizedResponse.substring(1).trim();
        }
        while (normalizedResponse.endsWith(',') || normalizedResponse.endsWith(']')) {
          normalizedResponse = normalizedResponse.substring(0, normalizedResponse.length - 1).trim();
        }

        if (!normalizedResponse.length) {
          return {result: null, inProgress: false};
        }

        if (!normalizedResponse.endsWith('}')) {
          return {result: normalizedResponse, inProgress: true};
        }

        try {
          const parsedResponse = JSON.parse(`${normalizedResponse}`);
          const transformedResponse = `data: ${JSON.stringify(parsedResponse)}\n\n`;
          return {result: transformedResponse, inProgress: false};
        } catch (error) {
          throw new Error(`Failed to parse response: ${error}.`);
        }
    },
  },
].map((client) => ({ ...client, patternInfo: parsePattern(client.patternForProxy) }));

// IMPORTANT: Vertex AI Studio SSRF Protection
// The set below is the exhaustive allow-list of upstream hostnames this
// proxy may forward authenticated requests to. It is sourced at code
// generation time from the RestApiClient.getAllowedUpstreamHosts() of every
// client embedded in API_CLIENT_MAP. Removing, weakening, or widening this
// check (for example, by adding wildcards or computing entries from request
// data) re-introduces the SSRF vulnerability that allows the deployed
// service account's OAuth access token to be exfiltrated to an
// attacker-controlled host.
const ALLOWED_UPSTREAM_HOSTS = new Set([
  "aiplatform.clients6.google.com",
]);

// Uses Google Application Default Credentials (ADC).
// Users need to run "gcloud auth application-default login" in order to use the proxy.
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePattern(pattern) {
  const paramRegex = /\{\{(.*?)\}\}/g;
  const params = [];
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = paramRegex.exec(pattern)) !== null) {
    params.push(match[1]);
    const literalPart = pattern.substring(lastIndex, match.index);
    parts.push(escapeRegex(literalPart));
    parts.push(`(?<${match[1]}>[^/]+)`);
    lastIndex = paramRegex.lastIndex;
  }
  parts.push(escapeRegex(pattern.substring(lastIndex)));
  const regexString = parts.join('');

  return {regex: new RegExp(`^${regexString}$`), params};
}

function extractParams(patternInfo, url) {
  const match = url.match(patternInfo.regex);
  if (!match) return null;
  const params = {};
  patternInfo.params.forEach((paramName, index) => {
    params[paramName] = match[index + 1];
  });
  return params;
}

async function getAccessToken(res) {
  try {
    const authClient = await auth.getClient();
    const token = await authClient.getAccessToken();
    return token.token;
  } catch (error) {
    console.error('[Node Proxy] Authentication error:', error);
    if (!res) return null;
    if (error.code === 'ERR_GCLOUD_NOT_LOGGED_IN' || (error.message && error.message.includes('Could not load the default credentials'))) {
      res.status(401).json({
        error: 'Authentication Required',
        message: 'Google Cloud Application Default Credentials not found or invalid. Please run "gcloud auth application-default login" and try again.',
      });
    } else {
      res.status(500).json({ error: `Authentication failed: ${error.message}` });
    }
    return null;
  }
}

function getRequestHeaders(accessToken) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'X-Goog-User-Project': GOOGLE_CLOUD_PROJECT,
    'Content-Type': 'application/json',
  };
}

// --- Proxy Endpoint ---
app.post('/api-proxy', async (req, res) => {

  // Check for the custom header added by the shim
  if (req.headers['x-app-proxy'] !== PROXY_HEADER) {
    return res.status(403).send('Forbidden: Request must originate from the Vertex App shim.');
  }

  const { originalUrl, method, headers, body } = req.body;
  if (!originalUrl) {
    return res.status(400).send('Bad Request: originalUrl is required.');
  }

  // 1. Find the matching API client
  const apiClient = API_CLIENT_MAP.find(p => {
    // We store extractedParams on req for use later if needed, though getVertexUrl takes it as arg.
    req.extractedParams = extractParams(p.patternInfo, originalUrl);
    return req.extractedParams !== null;
  });

  if (!apiClient) {
    console.error(`[Node Proxy] No API client handler found for URL: ${originalUrl}`);
    return res.status(404).json({ error: `No proxy handler found for URL: ${originalUrl}` });
  }

  const extractedParams = req.extractedParams;
  console.log(`[Node Proxy] Matched API client: ${apiClient.name}`);
  try {
    // 2. Get authenticated access token
    const accessToken = await getAccessToken(res);
    if (!accessToken) return;

    // 3. Construct the full API URL using env-set GOOGLE_CLOUD_PROJECT/LOCATION and extracted params
    const context = {projectId: GOOGLE_CLOUD_PROJECT, region: GOOGLE_CLOUD_LOCATION};
    const apiUrl = apiClient.getApiEndpoint(context, extractedParams);

    // IMPORTANT: Vertex AI Studio SSRF Protection
    // Parse the constructed apiUrl with the standard URL parser (not a
    // regex) and require the resulting hostname to be in the hardcoded
    // ALLOWED_UPSTREAM_HOSTS set. This neutralizes attacks that smuggle a
    // URL-grammar delimiter (e.g. '#') into a pattern parameter to redirect
    // the authenticated upstream request to an attacker-controlled host.
    let parsedApiUrl;
    try {
      parsedApiUrl = new URL(apiUrl);
    } catch (e) {
      console.error(`[Node Proxy] Invalid API URL: ${apiUrl}`);
      return res.status(400).json({ error: 'Invalid API URL.' });
    }
    if (!ALLOWED_UPSTREAM_HOSTS.has(parsedApiUrl.hostname.toLowerCase())) {
      console.error(`[Node Proxy] Upstream host not allowed: ${parsedApiUrl.hostname}`);
      return res.status(400).json({ error: 'Upstream host not allowed.' });
    }
    console.log(`[Node Proxy] Forwarding to Vertex API: ${apiUrl}`);

    // 4. Prepare headers for the API call
    const apiHeaders = getRequestHeaders(accessToken);

    const apiFetchOptions = {
      method: method || 'POST',
      headers: {...apiHeaders, ...headers},
      body: body ? body : undefined,
    };

    // 5. Make the call to the API
    const apiResponse = await fetch(apiUrl, apiFetchOptions);

    // 6. Respond to the client based on stream type
    if (apiClient.isStreaming) {
      console.log(`[Node Proxy] Sending STREAMING response for ${apiClient.name}`);
      // Set headers for a streaming JSON response
      res.writeHead(apiResponse.status, {
        'Content-Type': 'text/event-stream',
        'Transfer-Encoding': 'chunked',
        'Connection': 'keep-alive',
      });
      // Immediately send headers
      res.flushHeaders();

      if (!apiResponse.body) {
        console.error('[Node Proxy] Streaming response has no body.');
        return res.end(JSON.stringify({ error: 'Streaming response body is null' }));
      }

      const decoder = new TextDecoder();
      let deltaChunk = '';
      apiResponse.body.on('data', (encodedChunk) => {
        if (res.writableEnded) return; // Prevent writing after res.end()

        try {
          if (!apiClient.transformFn) {
            res.write(encodedChunk);
          } else {
            const decodedChunk = decoder.decode(encodedChunk, { stream: true });
            deltaChunk = deltaChunk + decodedChunk;

            const {result, inProgress} = apiClient.transformFn(deltaChunk);
            if (result && !inProgress) {
              deltaChunk = '';
              res.write(new TextEncoder().encode(result));
            }
          }
        } catch (error) {
          console.error(`[Node Proxy] Error processing streaming response for ${apiClient.name}`);
          console.error(error);
        }
      });

      apiResponse.body.on('end', () => {
        deltaChunk = '';
        console.log(`[Node Proxy] Vertex stream finished and all data processed for ${apiClient.name}`);
        res.end();
      });

      apiResponse.body.on('error', (streamError) => {
        console.error('[Node Proxy] Error from Vertex stream:', streamError);
        if (!res.writableEnded) {
          res.end(JSON.stringify({ proxyError: 'Stream error from Vertex AI', details: streamError.message }));
        }
      });

      res.on('error', (resError) => {
        console.error('[Node Proxy] Error writing to client response:', resError);
        // The source stream might need to be destroyed if an error occurs here.
        if (apiResponse.body && typeof apiResponse.body.destroy === 'function') {
             apiResponse.body.destroy(resError);
        }
      });
    } else {
      // Non-streaming response handling
      console.log(`[Node Proxy] Sending JSON response for ${apiClient.name}`);
      const data = await apiResponse.json();
      res.status(apiResponse.status).json(data);
    }
  } catch (error) {
    console.error(`[Node Proxy] Error proxying request for ${apiClient.name}`);
    console.error(error)
    res.status(500).json({ error: error });
  }
});

// ── Database ────────────────────────────────────────────────────────────────
const { Pool } = pg;

const INSTANCE_CONNECTION_NAME = process.env.INSTANCE_CONNECTION_NAME;
const DB_NAME = process.env.DB_NAME || 'jobsearch';
const DB_USER = process.env.DB_USER || 'jobsearch';
const DB_PASS = process.env.DB_PASS;
const DIGEST_GMAIL_PASS = process.env.DIGEST_GMAIL_PASS;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DIGEST_INTERNAL_KEY = process.env.DIGEST_INTERNAL_KEY;

let pool = null;
if (INSTANCE_CONNECTION_NAME && DB_PASS) {
  pool = new Pool({
    host: `/cloudsql/${INSTANCE_CONNECTION_NAME}`,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
  });
  console.log(`[DB] Pool created for instance: ${INSTANCE_CONNECTION_NAME}`);
} else {
  console.warn('[DB] INSTANCE_CONNECTION_NAME or DB_PASS not set — SQL routes will return 503');
}

const requireDb = (req, res, next) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  next();
};

// ── Accounts / auth ─────────────────────────────────────────────────────────
// Every /api/* route requires a valid Google ID token (the same one the
// frontend's Google Sign-In button already produces) in the Authorization
// header: `Authorization: Bearer <id_token>`. The token is verified against
// Google (not just decoded), the email is checked against ALLOWED_EMAILS,
// and an `accounts` row is created on first sign-in so every account's data
// stays isolated from every other account's — the demo account included.
const oauth2Client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: 'Missing bearer token' });

    const ticket = await oauth2Client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = (payload?.email || '').toLowerCase();
    if (!email || !payload.email_verified) {
      return res.status(401).json({ error: 'Unverified Google account' });
    }
    if (ALLOWED_EMAILS.length && !ALLOWED_EMAILS.includes(email)) {
      return res.status(403).json({ error: 'This account is not authorized to access this app' });
    }

    const { rows } = await pool.query(
      `INSERT INTO accounts (email, "displayName")
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET "displayName" = COALESCE(accounts."displayName", $2)
       RETURNING id, email, "isDemo"`,
      [email, payload.name || null]
    );
    req.accountId = rows[0].id;
    req.accountEmail = rows[0].email;
    req.isDemoAccount = rows[0].isDemo;
    next();
  } catch (e) {
    console.error('[Auth] Token verification failed:', e.message);
    res.status(401).json({ error: 'Invalid or expired sign-in — please sign in again' });
  }
};

// Every route below this line requires a verified, authorized account.
app.use('/api', requireDb, requireAuth);

// ── API routes ───────────────────────────────────────────────────────────────

const dbError = (res, err) => {
  console.error('[DB Error]', err.message);
  res.status(500).json({ error: err.message });
};

app.get('/api/me', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT first_name, last_name, display_email, linkedin, phone_number FROM accounts WHERE id=$1',
      [req.accountId]
    );
    const row = rows[0] || {};
    res.json({
      email: req.accountEmail,
      isDemo: req.isDemoAccount,
      firstName: row.first_name || null,
      lastName: row.last_name || null,
      displayEmail: row.display_email || null,
      linkedin: row.linkedin || null,
      phoneNumber: row.phone_number || null,
    });
  } catch (e) { dbError(res, e); }
});

app.put('/api/me/profile', async (req, res) => {
  try {
    const { firstName, lastName, displayEmail, linkedin, phoneNumber } = req.body;
    await pool.query(
      `UPDATE accounts SET first_name=$2, last_name=$3, display_email=$4, linkedin=$5, phone_number=$6 WHERE id=$1`,
      [req.accountId, firstName || null, lastName || null, displayEmail || null, linkedin || null, phoneNumber || null]
    );
    res.json({ ok: true });
  } catch (e) { dbError(res, e); }
});

// Jobs
app.get('/api/jobs', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM jobs WHERE "accountId"=$1 ORDER BY "dateAdded" DESC', [req.accountId]);
    res.json(rows);
  } catch (e) { dbError(res, e); }
});
app.post('/api/jobs', async (req, res) => {
  try {
    const j = req.body;
    await pool.query(
      `INSERT INTO jobs (id, "accountId", title, company, status, url, description, "dateAdded", "matchScore", "matchAnalysis", location, tags, "dateApplied", "customFields", source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO NOTHING`,
      [j.id, req.accountId, j.title, j.company, j.status, j.url, j.description, j.dateAdded, j.matchScore || null, j.matchAnalysis, j.location,
       JSON.stringify(j.tags ?? []), j.dateApplied || null, JSON.stringify(j.customFields ?? {}), j.source || null]
    );
    if (j.status) {
      await pool.query(
        `INSERT INTO job_status_history (id, "jobId", "accountId", "fromStatus", "toStatus") VALUES ($1,$2,$3,$4,$5)`,
        [crypto.randomUUID(), j.id, req.accountId, null, j.status]
      );
    }
    res.status(201).json(j);
  } catch (e) { dbError(res, e); }
});
app.put('/api/jobs/:id', async (req, res) => {
  try {
    const j = req.body;
    if (j.status) {
      const { rows } = await pool.query(
        `SELECT status FROM jobs WHERE id=$1 AND "accountId"=$2`,
        [req.params.id, req.accountId]
      );
      if (rows.length && rows[0].status !== j.status) {
        await pool.query(
          `INSERT INTO job_status_history (id, "jobId", "accountId", "fromStatus", "toStatus") VALUES ($1,$2,$3,$4,$5)`,
          [crypto.randomUUID(), req.params.id, req.accountId, rows[0].status, j.status]
        );
      }
    }
    await pool.query(
      `UPDATE jobs SET
         title        = COALESCE($3, title),
         company      = COALESCE($4, company),
         status       = COALESCE($5, status),
         url          = COALESCE($6, url),
         description  = COALESCE($7, description),
         location     = COALESCE($8, location),
         tags         = $9,
         "dateApplied"   = $10,
         "customFields"  = $11,
         source          = $12
       WHERE id=$1 AND "accountId"=$2`,
      [req.params.id, req.accountId,
       j.title   || null, j.company || null, j.status || null,
       j.url     || null, j.description || null, j.location || null,
       JSON.stringify(j.tags ?? []), j.dateApplied || null, JSON.stringify(j.customFields ?? {}),
       j.source || null]
    );
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});
app.delete('/api/jobs/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM jobs WHERE id=$1 AND "accountId"=$2', [req.params.id, req.accountId]);
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

// Notes
app.get('/api/notes', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM notes WHERE "accountId"=$1 ORDER BY date DESC', [req.accountId]);
    res.json(rows);
  } catch (e) { dbError(res, e); }
});
app.post('/api/notes', async (req, res) => {
  try {
    const n = req.body;
    await pool.query(
      `INSERT INTO notes (id, "accountId", "jobId", type, title, content, date, "isAiGenerated")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [n.id, req.accountId, n.jobId, n.type, n.title, n.content, n.date, n.isAiGenerated ?? false]
    );
    res.status(201).json(n);
  } catch (e) { dbError(res, e); }
});
app.put('/api/notes/:id', async (req, res) => {
  try {
    const n = req.body;
    await pool.query(
      `UPDATE notes SET type=$1, title=$2, content=$3 WHERE id=$4 AND "accountId"=$5`,
      [n.type, n.title, n.content, req.params.id, req.accountId]
    );
    res.json(n);
  } catch (e) { dbError(res, e); }
});
app.delete('/api/notes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM notes WHERE id=$1 AND "accountId"=$2', [req.params.id, req.accountId]);
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

// Resume — a single structured resume per account. Section definitions
// (ids/labels/types) live in ./resumeSections.js, not here, so they can be
// changed without touching routes or the frontend.
app.get('/api/resume-config', (req, res) => {
  res.json({ sections: RESUME_SECTIONS, totalCharBudget: TOTAL_CHAR_BUDGET });
});

app.get('/api/resume', async (req, res) => {
  try {
    const [textBlocks, entries, lines] = await Promise.all([
      pool.query('SELECT * FROM resume_section_content WHERE "accountId"=$1', [req.accountId]),
      pool.query('SELECT * FROM resume_entries WHERE "accountId"=$1 ORDER BY "order" ASC', [req.accountId]),
      pool.query('SELECT * FROM resume_lines WHERE "accountId"=$1 ORDER BY "order" ASC', [req.accountId]),
    ]);
    res.json({ textBlocks: textBlocks.rows, entries: entries.rows, lines: lines.rows });
  } catch (e) { dbError(res, e); }
});

app.get('/api/resume/raw-import', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM resume_raw_import WHERE "accountId"=$1', [req.accountId]);
    res.json(rows[0] ?? null);
  } catch (e) { dbError(res, e); }
});
app.put('/api/resume/raw-import', async (req, res) => {
  try {
    const { content } = req.body;
    await pool.query(
      `INSERT INTO resume_raw_import ("accountId", content, "importedAt") VALUES ($1,$2,NOW())
       ON CONFLICT ("accountId") DO UPDATE SET content=$2, "importedAt"=NOW()`,
      [req.accountId, content ?? '']
    );
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

app.put('/api/resume/text/:sectionId', async (req, res) => {
  try {
    const section = getSection(req.params.sectionId);
    if (!section || section.type !== 'text') return res.status(400).json({ error: 'Unknown text section' });
    const { content } = req.body;
    await pool.query(
      `INSERT INTO resume_section_content ("accountId", "sectionId", content, "updatedAt") VALUES ($1,$2,$3,NOW())
       ON CONFLICT ("accountId","sectionId") DO UPDATE SET content=$3, "updatedAt"=NOW()`,
      [req.accountId, req.params.sectionId, content ?? '']
    );
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

app.post('/api/resume/entries', async (req, res) => {
  try {
    const en = req.body;
    const section = getSection(en.sectionId);
    if (!section || section.type !== 'entries') return res.status(400).json({ error: 'Unknown entries section' });
    await pool.query(
      `INSERT INTO resume_entries (id, "accountId", "sectionId", heading, subheading, "startDate", "endDate", location, "order")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [en.id, req.accountId, en.sectionId, en.heading || null, en.subheading || null, en.startDate || null, en.endDate || null, en.location || null, en.order ?? 0]
    );
    res.status(201).json(en);
  } catch (e) { dbError(res, e); }
});
app.put('/api/resume/entries/:id', async (req, res) => {
  try {
    const en = req.body;
    await pool.query(
      `UPDATE resume_entries SET heading=$3, subheading=$4, "startDate"=$5, "endDate"=$6, location=$7, "order"=$8 WHERE id=$1 AND "accountId"=$2`,
      [req.params.id, req.accountId, en.heading || null, en.subheading || null, en.startDate || null, en.endDate || null, en.location || null, en.order ?? 0]
    );
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});
app.delete('/api/resume/entries/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM resume_entries WHERE id=$1 AND "accountId"=$2', [req.params.id, req.accountId]);
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

app.post('/api/resume/lines', async (req, res) => {
  try {
    const l = req.body;
    const section = getSection(l.sectionId);
    if (!section || section.type === 'text') return res.status(400).json({ error: 'Unknown or non-line section' });
    if (l.jobId) {
      const { rows } = await pool.query('SELECT 1 FROM jobs WHERE id=$1 AND "accountId"=$2', [l.jobId, req.accountId]);
      if (!rows.length) return res.status(400).json({ error: 'Unknown job' });
    }
    if (l.entryId) {
      const { rows } = await pool.query('SELECT 1 FROM resume_entries WHERE id=$1 AND "accountId"=$2', [l.entryId, req.accountId]);
      if (!rows.length) return res.status(400).json({ error: 'Unknown entry' });
    }
    await pool.query(
      `INSERT INTO resume_lines (id, "accountId", "sectionId", "entryId", "jobId", content, "order")
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [l.id, req.accountId, l.sectionId, l.entryId || null, l.jobId || null, l.content, l.order ?? 0]
    );
    res.status(201).json(l);
  } catch (e) { dbError(res, e); }
});
app.put('/api/resume/lines/:id', async (req, res) => {
  try {
    const l = req.body;
    await pool.query(
      `UPDATE resume_lines SET content=$3, "order"=$4 WHERE id=$1 AND "accountId"=$2`,
      [req.params.id, req.accountId, l.content, l.order ?? 0]
    );
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});
app.delete('/api/resume/lines/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM resume_lines WHERE id=$1 AND "accountId"=$2', [req.params.id, req.accountId]);
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

// Resume Generations — the last AI line-selection + rendered Markdown per job.
app.get('/api/resume-generations', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM resume_generations WHERE "accountId"=$1 ORDER BY "updatedAt" DESC', [req.accountId]);
    res.json(rows);
  } catch (e) { dbError(res, e); }
});
app.get('/api/resume-generations/:jobId', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM resume_generations WHERE "jobId"=$1 AND "accountId"=$2', [req.params.jobId, req.accountId]);
    res.json(rows[0] ?? null);
  } catch (e) { dbError(res, e); }
});
app.put('/api/resume-generations/:jobId', async (req, res) => {
  try {
    const g = req.body;
    await pool.query(
      `INSERT INTO resume_generations ("jobId", "accountId", "selectedLineIds", "renderedMarkdown", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,NOW(),NOW())
       ON CONFLICT ("jobId") DO UPDATE SET "selectedLineIds"=$3, "renderedMarkdown"=$4, "updatedAt"=NOW()`,
      [req.params.jobId, req.accountId, JSON.stringify(g.selectedLineIds ?? []), g.renderedMarkdown ?? '']
    );
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

// Context Resources
app.get('/api/context', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM context_resources WHERE "accountId"=$1 ORDER BY "dateAdded" DESC', [req.accountId]);
    res.json(rows);
  } catch (e) { dbError(res, e); }
});
app.post('/api/context', async (req, res) => {
  try {
    const c = req.body;
    await pool.query(
      `INSERT INTO context_resources (id, "accountId", title, content, "dateAdded") VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [c.id, req.accountId, c.title, c.content, c.dateAdded]
    );
    res.status(201).json(c);
  } catch (e) { dbError(res, e); }
});
app.delete('/api/context/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM context_resources WHERE id=$1 AND "accountId"=$2', [req.params.id, req.accountId]);
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

// Preferences (one row per account)
app.get('/api/preferences', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM preferences WHERE "accountId"=$1', [req.accountId]);
    res.json(rows[0] ?? {});
  } catch (e) { dbError(res, e); }
});
app.put('/api/preferences', async (req, res) => {
  try {
    const p = req.body;
    await pool.query(
      `INSERT INTO preferences ("accountId", "petalsExercise", "linkedInProfile") VALUES ($1,$2,$3)
       ON CONFLICT ("accountId") DO UPDATE SET "petalsExercise"=$2, "linkedInProfile"=$3`,
      [req.accountId, p.petalsExercise, p.linkedInProfile ?? null]
    );
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

// Journal Entries
app.get('/api/journal', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM journal_entries WHERE "accountId"=$1 ORDER BY date DESC', [req.accountId]);
    res.json(rows);
  } catch (e) { dbError(res, e); }
});
app.post('/api/journal', async (req, res) => {
  try {
    const e = req.body;
    await pool.query(
      `INSERT INTO journal_entries (id, "accountId", date, content) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
      [e.id, req.accountId, e.date, e.content]
    );
    res.status(201).json(e);
  } catch (e) { dbError(res, e); }
});
app.put('/api/journal/:id', async (req, res) => {
  try {
    const e = req.body;
    await pool.query(
      `UPDATE journal_entries SET date=$3, content=$4 WHERE id=$1 AND "accountId"=$2`,
      [req.params.id, req.accountId, e.date, e.content]
    );
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});
app.delete('/api/journal/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM journal_entries WHERE id=$1 AND "accountId"=$2', [req.params.id, req.accountId]);
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

// Interview Questions
app.get('/api/interview-questions', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM interview_questions WHERE "accountId"=$1 ORDER BY "dateAdded" DESC', [req.accountId]);
    res.json(rows);
  } catch (e) { dbError(res, e); }
});
app.post('/api/interview-questions', async (req, res) => {
  try {
    const q = req.body;
    await pool.query(
      `INSERT INTO interview_questions (id, "accountId", question, response, category, "dateAdded")
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [q.id, req.accountId, q.question, q.response, q.category ?? 'General', q.dateAdded]
    );
    res.status(201).json(q);
  } catch (e) { dbError(res, e); }
});
app.put('/api/interview-questions/:id', async (req, res) => {
  try {
    const q = req.body;
    await pool.query(
      `UPDATE interview_questions SET question=$3, response=$4, category=$5 WHERE id=$1 AND "accountId"=$2`,
      [req.params.id, req.accountId, q.question, q.response, q.category ?? 'General']
    );
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});
app.delete('/api/interview-questions/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM interview_questions WHERE id=$1 AND "accountId"=$2', [req.params.id, req.accountId]);
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

// Job Analyses
function parseStoredArray(val) {
  if (Array.isArray(val)) return val;
  if (!val) return [];
  const s = String(val);
  try { return JSON.parse(s); } catch { /* fall through */ }
  // Legacy: pg driver serialized a JS array into a PostgreSQL array literal {"item1","item2"}
  if (s.startsWith('{') && s.endsWith('}')) {
    return [...s.slice(1, -1).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]);
  }
  return [];
}
app.get('/api/job-analyses', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM job_analyses WHERE "accountId"=$1 ORDER BY "createdAt" DESC', [req.accountId]);
    res.json(rows.map(r => ({
      ...r,
      fitReason: parseStoredArray(r.fitReason),
      resumeEdits: parseStoredArray(r.resumeEdits),
    })));
  } catch (e) { dbError(res, e); }
});
app.put('/api/job-analyses/:jobId', async (req, res) => {
  try {
    const a = req.body;
    await pool.query('DELETE FROM job_analyses WHERE "jobId"=$1 AND "accountId"=$2', [req.params.jobId, req.accountId]);
    await pool.query(
      `INSERT INTO job_analyses (id, "accountId", "jobId", score, pros, cons, "fitReason", "resumeEdits", "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [a.id, req.accountId, req.params.jobId, a.score, JSON.stringify(a.pros ?? []), JSON.stringify(a.cons ?? []),
       JSON.stringify(a.fitReason ?? []), JSON.stringify(a.resumeEdits ?? []), a.createdAt]
    );
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});
app.delete('/api/job-analyses/:jobId', async (req, res) => {
  try {
    await pool.query('DELETE FROM job_analyses WHERE "jobId"=$1 AND "accountId"=$2', [req.params.jobId, req.accountId]);
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

// ── Internal: weekly digest ──────────────────────────────────────────────────
app.post('/internal/weekly-digest', async (req, res) => {
  const header = req.headers['x-internal-key'];
  if (!DIGEST_INTERNAL_KEY || header !== DIGEST_INTERNAL_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  if (!DIGEST_GMAIL_PASS) return res.status(503).json({ error: 'DIGEST_GMAIL_PASS not set' });
  if (!GEMINI_API_KEY) return res.status(503).json({ error: 'GEMINI_API_KEY not set' });

  try {
    await runWeeklyDigest(pool, DIGEST_GMAIL_PASS, GEMINI_API_KEY);
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[Digest] Unhandled error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Server ───────────────────────────────────────────────────────────────────
const server = app.listen(PORT, API_BACKEND_HOST, () => {
  console.log(`Vertex AI Backend listening at http://localhost:${PORT}`);
});


const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', async (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === '/ws-proxy') {
    
    let targetUrl = url.searchParams.get('target');
    if (!targetUrl) {
      console.log('[Node Proxy] Missing target URL');
      socket.destroy();
      return;
    }

    if (targetUrl === 'wss://aiplatform.googleapis.com//ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent') {
      const location = GOOGLE_CLOUD_LOCATION === 'global' ? 'us-central1' : GOOGLE_CLOUD_LOCATION;
      targetUrl = `wss://${location}-aiplatform.googleapis.com//ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
    } else {
      console.log('[Node Proxy] Invalid target URL');
      socket.destroy();
      return;
    }

    let accessToken;

    try {
      accessToken = await getAccessToken();
      if (!accessToken) throw new Error('No token');
    } catch (err) {
      console.log('[Node Proxy] Authentication failed');
      socket.destroy();
      return;
    }

    console.log(`[Node Proxy] Initiating upstream connection to: ${targetUrl}`);

    let upstreamWs;

    try {
      upstreamWs = new WebSocket(targetUrl, {
        headers: getRequestHeaders(accessToken)
      });
    } catch (e) {
      console.error('[Node Proxy] Invalid Upstream URL');
      socket.destroy();
      return;
    }

    const initialErrorHandler = (error) => {
      console.error('[Node Proxy] Upstream connection failed:', error);
      upstreamWs.removeEventListener('open', onUpstreamOpen);

      if (socket.writable) {
        socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        socket.destroy();
      }
    };

    upstreamWs.once('error', initialErrorHandler);

    // 5. Handle Successful Upstream Connection
    const onUpstreamOpen = () => {
      // Remove the "bootstrapping" error handler
      upstreamWs.removeListener('error', initialErrorHandler);

      // Perform the HTTP -> WebSocket upgrade for the Client
      wss.handleUpgrade(request, socket, head, (ws) => {

        upstreamWs.on('message', (data, isBinary) => {
          const logMsg = isBinary ? '<Binary Data>' : data.toString();
          console.log(`[Upstream -> Client] [${new Date().toISOString()}]: ${logMsg}`);

          if (ws.readyState === WebSocket.OPEN) {
            if (data === undefined || data === null) {
              console.warn('[Node Proxy] Attempted to send undefined/null data to client');
              return;
            }
            ws.send(data, { binary: isBinary });
          }
        });

        ws.on('message', (data, isBinary) => {
          const logMsg = isBinary ? '<Binary Data>' : data.toString();

          let dataJson = {};
          try {
            dataJson = JSON.parse(data.toString());
          } catch (error) {
            console.error('[Node Proxy] Failed to parse message from client:', error);
            ws.close(1011, 'Failed to parse message');
          }

          if (dataJson['setup']) {
            dataJson['setup']['model'] = `projects/${GOOGLE_CLOUD_PROJECT}/locations/${GOOGLE_CLOUD_LOCATION}/${dataJson['setup']['model']}`;
          }

          if (upstreamWs.readyState === WebSocket.OPEN) {
            upstreamWs.send(JSON.stringify(dataJson), { binary: false });
          }
        });

        upstreamWs.on('error', (error) => {
          console.error('[Node Proxy] Upstream error:', error);
          ws.close(1011, error.message);
        });

        upstreamWs.on('close', (code, reason) => {
          console.log(`[Node Proxy] Upstream closed: ${code} ${reason}`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(code, reason);
          }
        });

        ws.on('error', (error) => {
          console.error('[Node Proxy] Client error:', error);
          upstreamWs.close(1011, error.message);
        });

        ws.on('close', (code, reason) => {
          console.log(`[Node Proxy] Client closed: ${code} ${reason}`);
          if (upstreamWs.readyState === WebSocket.OPEN) {
            upstreamWs.close(1000, reason);
          }
        });

        wss.emit('connection', ws, request);
      });
    };

    upstreamWs.once('open', onUpstreamOpen);

  } else {
    // Path did not match
    socket.destroy();
  }
});


