
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import rateLimit from 'express-rate-limit';
import { WebSocketServer, WebSocket } from 'ws';

const app = express();
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true); // allow server-to-server / curl
        const allowed = origin.endsWith('.run.app') || origin === 'https://jobsearch.workbench-data.com' || origin === 'http://localhost:8080' || origin === 'http://localhost:3000'
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

// ── API routes ───────────────────────────────────────────────────────────────

const dbError = (res, err) => {
  console.error('[DB Error]', err.message);
  res.status(500).json({ error: err.message });
};

// Jobs
app.get('/api/jobs', requireDb, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM jobs ORDER BY "dateAdded" DESC');
    res.json(rows);
  } catch (e) { dbError(res, e); }
});
app.post('/api/jobs', requireDb, async (req, res) => {
  try {
    const j = req.body;
    await pool.query(
      `INSERT INTO jobs (id, title, company, status, url, description, "dateAdded", "matchScore", "matchAnalysis", location, tags, "dateApplied", "customFields")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (id) DO NOTHING`,
      [j.id, j.title, j.company, j.status, j.url, j.description, j.dateAdded, j.matchScore || null, j.matchAnalysis, j.location,
       JSON.stringify(j.tags ?? []), j.dateApplied || null, JSON.stringify(j.customFields ?? {})]
    );
    res.status(201).json(j);
  } catch (e) { dbError(res, e); }
});
app.put('/api/jobs/:id', requireDb, async (req, res) => {
  try {
    const j = req.body;
    await pool.query(
      `UPDATE jobs SET
         title        = COALESCE($2, title),
         company      = COALESCE($3, company),
         status       = COALESCE($4, status),
         url          = COALESCE($5, url),
         description  = COALESCE($6, description),
         location     = COALESCE($7, location),
         tags         = $8,
         "dateApplied"   = $9,
         "customFields"  = $10
       WHERE id=$1`,
      [req.params.id,
       j.title   || null, j.company || null, j.status || null,
       j.url     || null, j.description || null, j.location || null,
       JSON.stringify(j.tags ?? []), j.dateApplied || null, JSON.stringify(j.customFields ?? {})]
    );
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});
app.delete('/api/jobs/:id', requireDb, async (req, res) => {
  try {
    await pool.query('DELETE FROM jobs WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

// Notes
app.get('/api/notes', requireDb, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM notes ORDER BY date DESC');
    res.json(rows);
  } catch (e) { dbError(res, e); }
});
app.post('/api/notes', requireDb, async (req, res) => {
  try {
    const n = req.body;
    await pool.query(
      `INSERT INTO notes (id, "jobId", type, title, content, date, "isAiGenerated")
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [n.id, n.jobId, n.type, n.title, n.content, n.date, n.isAiGenerated ?? false]
    );
    res.status(201).json(n);
  } catch (e) { dbError(res, e); }
});
app.delete('/api/notes/:id', requireDb, async (req, res) => {
  try {
    await pool.query('DELETE FROM notes WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

// Resumes
app.get('/api/resumes', requireDb, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM resumes ORDER BY "lastUpdated" DESC');
    res.json(rows);
  } catch (e) { dbError(res, e); }
});
app.post('/api/resumes', requireDb, async (req, res) => {
  try {
    const r = req.body;
    await pool.query(
      `INSERT INTO resumes (id, name, content, "targetRole", "lastUpdated")
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.content, r.targetRole, r.lastUpdated]
    );
    res.status(201).json(r);
  } catch (e) { dbError(res, e); }
});
app.put('/api/resumes/:id', requireDb, async (req, res) => {
  try {
    const r = req.body;
    await pool.query(
      `UPDATE resumes SET name=$2, content=$3, "targetRole"=$4, "lastUpdated"=$5 WHERE id=$1`,
      [req.params.id, r.name, r.content, r.targetRole, r.lastUpdated]
    );
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});
app.delete('/api/resumes/:id', requireDb, async (req, res) => {
  try {
    await pool.query('DELETE FROM resumes WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

// Context Resources
app.get('/api/context', requireDb, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM context_resources ORDER BY "dateAdded" DESC');
    res.json(rows);
  } catch (e) { dbError(res, e); }
});
app.post('/api/context', requireDb, async (req, res) => {
  try {
    const c = req.body;
    await pool.query(
      `INSERT INTO context_resources (id, title, content, "dateAdded") VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
      [c.id, c.title, c.content, c.dateAdded]
    );
    res.status(201).json(c);
  } catch (e) { dbError(res, e); }
});
app.delete('/api/context/:id', requireDb, async (req, res) => {
  try {
    await pool.query('DELETE FROM context_resources WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

// Preferences (single row, id=1)
app.get('/api/preferences', requireDb, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM preferences WHERE id=1');
    res.json(rows[0] ?? {});
  } catch (e) { dbError(res, e); }
});
app.put('/api/preferences', requireDb, async (req, res) => {
  try {
    const p = req.body;
    await pool.query(
      `INSERT INTO preferences (id, "petalsExercise", "linkedInProfile", "primaryResume") VALUES (1,$1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET "petalsExercise"=$1, "linkedInProfile"=$2, "primaryResume"=$3`,
      [p.petalsExercise, p.linkedInProfile ?? null, p.primaryResume ?? null]
    );
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

// Journal Entries
app.get('/api/journal', requireDb, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM journal_entries ORDER BY date DESC');
    res.json(rows);
  } catch (e) { dbError(res, e); }
});
app.post('/api/journal', requireDb, async (req, res) => {
  try {
    const e = req.body;
    await pool.query(
      `INSERT INTO journal_entries (id, date, content) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`,
      [e.id, e.date, e.content]
    );
    res.status(201).json(e);
  } catch (e) { dbError(res, e); }
});
app.put('/api/journal/:id', requireDb, async (req, res) => {
  try {
    const e = req.body;
    await pool.query(
      `UPDATE journal_entries SET date=$2, content=$3 WHERE id=$1`,
      [req.params.id, e.date, e.content]
    );
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});
app.delete('/api/journal/:id', requireDb, async (req, res) => {
  try {
    await pool.query('DELETE FROM journal_entries WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

// Interview Questions
app.get('/api/interview-questions', requireDb, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM interview_questions ORDER BY "dateAdded" DESC');
    res.json(rows);
  } catch (e) { dbError(res, e); }
});
app.post('/api/interview-questions', requireDb, async (req, res) => {
  try {
    const q = req.body;
    await pool.query(
      `INSERT INTO interview_questions (id, question, response, category, "dateAdded")
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [q.id, q.question, q.response, q.category ?? 'General', q.dateAdded]
    );
    res.status(201).json(q);
  } catch (e) { dbError(res, e); }
});
app.put('/api/interview-questions/:id', requireDb, async (req, res) => {
  try {
    const q = req.body;
    await pool.query(
      `UPDATE interview_questions SET question=$2, response=$3, category=$4 WHERE id=$1`,
      [req.params.id, q.question, q.response, q.category ?? 'General']
    );
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});
app.delete('/api/interview-questions/:id', requireDb, async (req, res) => {
  try {
    await pool.query('DELETE FROM interview_questions WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});

// Job Analyses
app.get('/api/job-analyses', requireDb, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM job_analyses ORDER BY "createdAt" DESC');
    res.json(rows);
  } catch (e) { dbError(res, e); }
});
app.put('/api/job-analyses/:jobId', requireDb, async (req, res) => {
  try {
    const a = req.body;
    await pool.query('DELETE FROM job_analyses WHERE "jobId"=$1', [req.params.jobId]);
    await pool.query(
      `INSERT INTO job_analyses (id, "jobId", score, pros, cons, "fitReason", "resumeEdits", "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [a.id, req.params.jobId, a.score, JSON.stringify(a.pros ?? []), JSON.stringify(a.cons ?? []),
       a.fitReason, a.resumeEdits, a.createdAt]
    );
    res.status(204).end();
  } catch (e) { dbError(res, e); }
});
app.delete('/api/job-analyses/:jobId', requireDb, async (req, res) => {
  try {
    await pool.query('DELETE FROM job_analyses WHERE "jobId"=$1', [req.params.jobId]);
    res.status(204).end();
  } catch (e) { dbError(res, e); }
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


