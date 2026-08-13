import { createClient } from '@clickhouse/client';
import { GoogleGenAI } from '@google/genai';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.AGENT_PORT || 8787);
const maxRequestBytes = 900_000;
const distDirectory = join(process.cwd(), 'dist');
const clickhouseDatabase = (process.env.CLICKHOUSE_DATABASE || 'story_is_straight').replace(/[^A-Za-z0-9_]/g, '');

function configured() {
  return Boolean(process.env.GOOGLE_CLOUD_PROJECT && process.env.CLICKHOUSE_HOST && process.env.CLICKHOUSE_PASSWORD);
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

async function reviewWithCloud(body) {
  if (!body.consent) throw new Error('Cloud review requires explicit consent.');
  const revisionText = String(body.revisionText || '').trim();
  const lockedFacts = Array.isArray(body.lockedFacts) ? body.lockedFacts.slice(0, 120) : [];
  if (!revisionText || !lockedFacts.length) throw new Error('Import an incoming draft and lock at least one canon fact before cloud review.');

  const projectId = safeProjectName(body.projectTitle);
  const clickhouse = createClient({
    host: process.env.CLICKHOUSE_HOST,
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD,
    database: clickhouseDatabase
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
    const ai = new GoogleGenAI({ enterprise: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1' });
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

const server = createServer(async (request, response) => {
  if (request.url === '/api/health') return json(response, 200, { configured: configured(), provider: 'Gemini Enterprise + ClickHouse' });
  if (request.url === '/api/agent/review' && request.method === 'POST') {
    if (!configured()) return json(response, 503, { error: 'Cloud review is not configured. Set Google Cloud ADC/project and ClickHouse environment variables on the server.' });
    try { return json(response, 200, await reviewWithCloud(await readJson(request))); }
    catch (error) { return json(response, 400, { error: error.message || 'Cloud review failed.' }); }
  }
  const candidate = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const requestedPath = normalize(join(distDirectory, candidate));
  if (!requestedPath.startsWith(distDirectory) || !existsSync(requestedPath)) return json(response, 404, { error: 'Not found' });
  const fileStat = await stat(requestedPath);
  if (fileStat.isDirectory()) return json(response, 404, { error: 'Not found' });
  response.writeHead(200, { 'Content-Type': contentType(requestedPath) });
  createReadStream(requestedPath).pipe(response);
});

server.listen(port, '127.0.0.1', () => console.log(`storyIsStraight agent server on http://127.0.0.1:${port}`));
