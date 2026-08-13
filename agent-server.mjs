import 'dotenv/config';
import { createClient } from '@clickhouse/client';
import { GoogleGenAI } from '@google/genai';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT || process.env.AGENT_PORT || 8787);
const maxRequestBytes = 900_000;
const reviewWindowMs = 15 * 60 * 1000;
const reviewLimit = Number(process.env.CLOUD_REVIEW_RATE_LIMIT || 5);
const distDirectory = join(process.cwd(), 'dist');
const clickhouseDatabase = (process.env.CLICKHOUSE_DATABASE || 'story_is_straight').replace(/[^A-Za-z0-9_]/g, '');
const reviewBuckets = new Map();

function configured() {
  return Boolean(process.env.GOOGLE_CLOUD_PROJECT && process.env.CLICKHOUSE_HOST && Object.hasOwn(process.env, 'CLICKHOUSE_PASSWORD'));
}

function contentType(path) {
  return { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' }[extname(path)] || 'application/octet-stream';
}

function json(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > maxRequestBytes) throw new Error('Request is too large for the cloud review endpoint.');
  }
  return JSON.parse(raw || '{}');
}

function safeProjectName(value) {
  return String(value || 'Untitled story').slice(0, 140);
}

function reviewRateLimited(request) {
  const now = Date.now();
  const key = request.headers['x-forwarded-for']?.split(',')[0].trim() || request.socket.remoteAddress || 'unknown';
  const active = (reviewBuckets.get(key) || []).filter((timestamp) => now - timestamp < reviewWindowMs);
  active.push(now);
  reviewBuckets.set(key, active);
  return active.length > reviewLimit;
}

function createEnterpriseClient() {
  let googleAuthOptions;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      googleAuthOptions = {
        credentials: {
          client_email: serviceAccount.client_email,
          private_key: serviceAccount.private_key,
          project_id: serviceAccount.project_id
        }
      };
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
    }
  }
  return new GoogleGenAI({
    enterprise: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    googleAuthOptions
  });
}

async function reviewWithCloud(body) {
  if (!body.consent) throw new Error('Cloud review requires explicit consent.');
  const revisionText = String(body.revisionText || '').trim();
  const lockedFacts = Array.isArray(body.lockedFacts) ? body.lockedFacts.slice(0, 120) : [];
  if (!revisionText || !lockedFacts.length) throw new Error('Import an incoming draft and lock at least one canon fact before cloud review.');

  const projectId = safeProjectName(body.projectTitle);
  const clickhouse = createClient({
    url: process.env.CLICKHOUSE_HOST,
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD
  });
  try {
    await clickhouse.exec({ query: `CREATE DATABASE IF NOT EXISTS ${clickhouseDatabase}` });
    await clickhouse.exec({ query: `CREATE TABLE IF NOT EXISTS ${clickhouseDatabase}.canon_evidence (project_id String, fact_id String, label String, fact_type String, source_name String, scene_label String, line_number UInt32, excerpt String, locked_at DateTime) ENGINE = ReplacingMergeTree ORDER BY (project_id, fact_id)` });
    await clickhouse.insert({
      table: `${clickhouseDatabase}.canon_evidence`,
      values: lockedFacts.map((fact) => ({
        project_id: projectId,
        fact_id: String(fact.id || ''),
        label: String(fact.label || ''),
        fact_type: String(fact.type || 'state'),
        source_name: String(fact.line?.file || 'Unknown source'),
        scene_label: String(fact.line?.sceneLabel || 'Unknown scene'),
        line_number: Number(fact.line?.lineNumber || 0),
        excerpt: String(fact.line?.text || '').slice(0, 1200),
        locked_at: new Date().toISOString().replace('T', ' ').replace('Z', '')
      })),
      format: 'JSONEachRow'
    });
    const result = await clickhouse.query({
      query: `SELECT label, fact_type, source_name, scene_label, line_number, excerpt FROM ${clickhouseDatabase}.canon_evidence WHERE project_id = {projectId:String} ORDER BY source_name, line_number LIMIT 120`,
      query_params: { projectId },
      format: 'JSONEachRow'
    });
    const evidence = await result.json();
    const ai = createEnterpriseClient();
    const prompt = `You are the storyIsStraight Continuity Agent. Review an incoming draft against approved canon evidence retrieved from ClickHouse. Return concise JSON only with this exact shape: {"summary":"...","findings":[{"severity":"critical|high|medium|low","title":"...","why":"...","evidence":"source · scene · line","smallest_repair":"..."}]}. Only make a finding when you can cite an evidence row. Do not invent facts.\n\nAPPROVED CANON EVIDENCE:\n${JSON.stringify(evidence)}\n\nINCOMING DRAFT:\n${revisionText.slice(0, 120000)}`;
    const completion = await ai.models.generateContent({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', contents: prompt, config: { responseMimeType: 'application/json', temperature: 0.15 } });
    const raw = completion.text || '{"summary":"Gemini returned no text.","findings":[]}';
    let review;
    try { review = JSON.parse(raw); } catch { review = { summary: raw, findings: [] }; }
    return { review, evidenceCount: evidence.length };
  } finally {
    await clickhouse.close();
  }
}

async function extractCanonCandidatesWithCloud(body) {
  if (!body.consent) throw new Error('AI canon extraction requires explicit consent.');
  const canonText = String(body.canonText || '').trim();
  if (!canonText) throw new Error('Import a canon source before generating AI candidates.');
  const ai = createEnterpriseClient();
  const prompt = `You are the storyIsStraight Canon Agent. Extract ONLY explicit, useful story facts from the supplied canon pages. Return concise JSON only with this exact shape: {"candidates":[{"type":"relationship|timeline|knowledge|motivation|prop|state|location|wardrobe|other","label":"one clear present-tense fact","why":"why protecting this matters","scene_label":"the bracketed scene label from the source","line_number":0,"evidence":"a short exact supporting excerpt"}]}. Include relationships, secrets/knowledge, timelines, motivations, props, character states, locations, or wardrobe only when stated or strongly established in the text. Do not invent facts, infer psychology, create spoilers, or write a fact without an evidence excerpt. Return at most 30 candidates. These are reviewable suggestions, not final canon.\n\nCANON SOURCE:\n${canonText.slice(0, 120000)}`;
  const completion = await ai.models.generateContent({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', contents: prompt, config: { responseMimeType: 'application/json', temperature: 0.1 } });
  const raw = completion.text || '{"candidates":[]}';
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Gemini returned an unreadable candidate list. Try again.'); }
  const candidates = Array.isArray(parsed.candidates) ? parsed.candidates.slice(0, 30) : [];
  return { candidates };
}

const server = createServer(async (request, response) => {
  if (request.url === '/api/health') return json(response, 200, { configured: configured(), provider: 'Gemini Enterprise + ClickHouse' });
  if (request.url === '/api/agent/review' && request.method === 'POST') {
    if (!configured()) return json(response, 503, { error: 'Cloud review is not configured. Set Google Cloud ADC/project and ClickHouse environment variables on the server.' });
    if (reviewRateLimited(request)) return json(response, 429, { error: 'Cloud review limit reached. Try again in 15 minutes.' });
    try { return json(response, 200, await reviewWithCloud(await readJson(request))); }
    catch (error) { return json(response, 400, { error: error.message || 'Cloud review failed.' }); }
  }
  if (request.url === '/api/agent/canon-candidates' && request.method === 'POST') {
    if (!configured()) return json(response, 503, { error: 'AI canon extraction is not configured. Set Google Cloud and ClickHouse environment variables on the server.' });
    if (reviewRateLimited(request)) return json(response, 429, { error: 'AI request limit reached. Try again in 15 minutes.' });
    try { return json(response, 200, await extractCanonCandidatesWithCloud(await readJson(request))); }
    catch (error) { return json(response, 400, { error: error.message || 'AI canon extraction failed.' }); }
  }
  const candidate = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const requestedPath = normalize(join(distDirectory, candidate));
  if (!requestedPath.startsWith(distDirectory) || !existsSync(requestedPath)) return json(response, 404, { error: 'Not found' });
  const fileStat = await stat(requestedPath);
  if (fileStat.isDirectory()) return json(response, 404, { error: 'Not found' });
  response.writeHead(200, { 'Content-Type': contentType(requestedPath) });
  createReadStream(requestedPath).pipe(response);
});

const host = process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : '127.0.0.1';
server.listen(port, host, () => console.log(`storyIsStraight agent server on http://${host}:${port}`));
