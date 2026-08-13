import 'dotenv/config';
import { createClient } from '@clickhouse/client';
import { GoogleGenAI } from '@google/genai';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { normalizeReview } from './continuity-analysis.mjs';
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

function clickhouseUrl() {
  const host = String(process.env.CLICKHOUSE_HOST || '').trim();
  if (/^https?:\/\//i.test(host)) return host;
  const secure = String(process.env.CLICKHOUSE_SECURE || 'true').toLowerCase() === 'true';
  const port = process.env.CLICKHOUSE_PORT || (secure ? '8443' : '8123');
  return `${secure ? 'https' : 'http'}://${host}:${port}`;
}

async function clickHouseMcpHealthy() {
  const endpoint = process.env.CLICKHOUSE_MCP_URL || 'http://127.0.0.1:8000/mcp';
  try {
    const healthUrl = new URL(endpoint);
    healthUrl.pathname = '/health';
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
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

async function queryThroughClickHouseMcp(query) {
  const endpoint = process.env.CLICKHOUSE_MCP_URL || 'http://127.0.0.1:8000/mcp';
  const token = process.env.CLICKHOUSE_MCP_AUTH_TOKEN || 'storyisstraight-internal-mcp';
  const client = new McpClient({ name: 'story-is-straight', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: 'run_query', arguments: { query } });
    const text = result?.content?.find((item) => item.type === 'text')?.text;
    if (!text) throw new Error('ClickHouse MCP returned no query result.');
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.rows) ? parsed.rows.map((row) => Object.fromEntries((parsed.columns || []).map((column, index) => [column, row[index]]))) : [];
  } finally {
    await transport.close().catch(() => {});
  }
}

async function retrieveCanonEvidence(projectId) {
  const escapedProjectId = projectId.replaceAll("'", "''");
  const query = `SELECT label, fact_type, source_name, scene_label, line_number, excerpt FROM ${clickhouseDatabase}.canon_evidence WHERE project_id = '${escapedProjectId}' ORDER BY source_name, line_number LIMIT 120`;
  const evidence = await queryThroughClickHouseMcp(query);
  return { evidence, via: 'official mcp-clickhouse / run_query' };
}

async function reviewWithCloud(body) {
  if (!body.consent) throw new Error('Cloud review requires explicit consent.');
  const revisionText = String(body.revisionText || '').trim();
  const lockedFacts = Array.isArray(body.lockedFacts) ? body.lockedFacts.slice(0, 120) : [];
  if (!revisionText || !lockedFacts.length) throw new Error('Import an incoming draft and lock at least one canon fact before cloud review.');

  const projectId = safeProjectName(body.projectTitle);
  const clickhouse = createClient({
    url: clickhouseUrl(),
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
    const { evidence, via } = await retrieveCanonEvidence(projectId);
    const ai = createEnterpriseClient();
    const prompt = `You are the storyIsStraight Continuity Crew. Review an incoming draft against approved canon evidence retrieved from ClickHouse. Return concise JSON only. Use this exact shape: {"summary":"...","findings":[{"severity":"critical|high|medium|low","confidence":"high|medium|low","finding_type":"direct_contradiction|timeline_impossibility|knowledge_leak|character_state_conflict|relationship_drift|prop_location_mismatch|setup_payoff_gap|needs_review","status":"confirmed|probable|needs_review","title":"...","why":"...","evidence_indices":[0],"evidence_excerpt":"short exact excerpt from a cited row","downstream_beats":["specific later beat at risk"],"impact_scope":"scene|episode|season|series","repair_options":[{"label":"smallest edit option","description":"what changes","canon_preservation":"high|medium|low","downstream_risk":"high|medium|low","edit_effort":"high|medium|low","confidence":"high|medium|low","tradeoffs":["..." ]}],"smallest_repair":"..."}]}. Evidence indices are zero-based indexes into the evidence rows below and are mandatory for every finding. Only make a finding when at least one evidence row directly supports it. Classify a direct contradiction only when the incoming draft asserts the incompatible state; use needs_review for ambiguity. Downstream beats must be stated in the incoming draft or clearly described as a direct consequence; never invent scenes. Repair options must be concrete, ranked implicitly by their dimensions, and keep human approval required. Do not invent facts.\n\nAPPROVED CANON EVIDENCE (numbered rows):\n${evidence.map((row, index) => `[${index}] ${JSON.stringify(row)}`).join('\n')}\n\nINCOMING DRAFT:\n${revisionText.slice(0, 120000)}`;
    const completion = await ai.models.generateContent({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', contents: prompt, config: { responseMimeType: 'application/json', temperature: 0.15 } });
    const raw = completion.text || '{"summary":"Gemini returned no text.","findings":[]}';
    let review;
    try { review = JSON.parse(raw); } catch { review = { summary: raw, findings: [] }; }
    const normalizedReview = normalizeReview(review, evidence);
    const findings = normalizedReview.findings;
    const revisionLines = revisionText.split(/\r?\n/).filter(Boolean).length;
    return {
      review: normalizedReview,
      evidenceCount: evidence.length,
      trace: [
        { label: 'Canon Retriever · ClickHouse MCP', detail: `${evidence.length} locked evidence row${evidence.length === 1 ? '' : 's'} loaded via ${via}.` },
        { label: 'Continuity Analyst · Gemini', detail: `${revisionLines} non-empty draft line${revisionLines === 1 ? '' : 's'} classified across ${Object.keys(normalizedReview.taxonomy.counts).length} continuity types.` },
        { label: 'Impact Mapper · evidence gate', detail: `${findings.length} finding${findings.length === 1 ? '' : 's'} returned; unsupported claims were excluded.` },
        { label: 'Repair Editor · scored options', detail: `${normalizedReview.metrics.repairable_findings} repair plan${normalizedReview.metrics.repairable_findings === 1 ? '' : 's'} ranked by canon preservation, risk, and effort.` },
        { label: 'Human approval remains required', detail: 'No canon fact is changed automatically.' }
      ]
    };
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
  return {
    candidates,
    trace: [
      { label: 'Read the canon source', detail: `${canonText.split(/\r?\n/).filter(Boolean).length} non-empty source line${canonText.split(/\r?\n/).filter(Boolean).length === 1 ? '' : 's'} sent for extraction.` },
      { label: 'Gemini proposed canon candidates', detail: `${candidates.length} source-backed candidate${candidates.length === 1 ? '' : 's'} returned for review.` },
      { label: 'Human approval remains required', detail: 'Candidates return as REVIEW items; nothing is locked automatically.' }
    ]
  };
}

async function askCanonWithCloud(body) {
  if (!body.consent) throw new Error('Ask the canon requires explicit consent.');
  const question = String(body.question || '').trim();
  const lockedFacts = Array.isArray(body.lockedFacts) ? body.lockedFacts.slice(0, 120) : [];
  if (!question || !lockedFacts.length) throw new Error('Ask a question and lock at least one canon fact first.');
  const projectId = safeProjectName(body.projectTitle);
  const clickhouse = createClient({ url: clickhouseUrl(), username: process.env.CLICKHOUSE_USER || 'default', password: process.env.CLICKHOUSE_PASSWORD });
  try {
    await clickhouse.exec({ query: `CREATE DATABASE IF NOT EXISTS ${clickhouseDatabase}` });
    await clickhouse.exec({ query: `CREATE TABLE IF NOT EXISTS ${clickhouseDatabase}.canon_evidence (project_id String, fact_id String, label String, fact_type String, source_name String, scene_label String, line_number UInt32, excerpt String, locked_at DateTime) ENGINE = ReplacingMergeTree ORDER BY (project_id, fact_id)` });
    await clickhouse.insert({ table: `${clickhouseDatabase}.canon_evidence`, values: lockedFacts.map((fact) => ({ project_id: projectId, fact_id: String(fact.id || ''), label: String(fact.label || ''), fact_type: String(fact.type || 'state'), source_name: String(fact.line?.file || 'Unknown source'), scene_label: String(fact.line?.sceneLabel || 'Unknown scene'), line_number: Number(fact.line?.lineNumber || 0), excerpt: String(fact.line?.text || '').slice(0, 1200), locked_at: new Date().toISOString().replace('T', ' ').replace('Z', '') })), format: 'JSONEachRow' });
    const { evidence, via } = await retrieveCanonEvidence(projectId);
    const ai = createEnterpriseClient();
    const prompt = `You are the storyIsStraight Canon Q&A Agent. Answer the question using ONLY the numbered approved evidence rows below. If the rows do not establish an answer, say that the canon does not contain enough evidence. Never infer hidden motives or invent events. Return concise JSON only with this exact shape: {"answer":"...","verdict":"supported|mixed|not_found","confidence":"high|medium|low","evidence_indices":[0]}. evidence_indices must contain only row numbers that directly support the answer.\n\nAPPROVED EVIDENCE:\n${evidence.map((row, index) => `[${index}] ${JSON.stringify(row)}`).join('\n')}\n\nQUESTION:\n${question.slice(0, 500)}`;
    const completion = await ai.models.generateContent({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', contents: prompt, config: { responseMimeType: 'application/json', temperature: 0.05 } });
    const raw = completion.text || '{"answer":"The canon does not contain enough evidence.","verdict":"not_found","confidence":"low","evidence_indices":[]}';
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = { answer: 'The canon returned an unreadable answer. Try a narrower question.', verdict: 'not_found', confidence: 'low', evidence_indices: [] }; }
    const indices = Array.isArray(parsed.evidence_indices) ? [...new Set(parsed.evidence_indices.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < evidence.length))] : [];
    const citations = indices.map((index) => evidence[index]);
    const grounded = citations.length > 0 && String(parsed.verdict || '').toLowerCase() !== 'not_found';
    return {
      answer: grounded ? String(parsed.answer || 'The canon supports this, but Gemini did not provide a concise answer.') : 'The canon does not contain enough locked evidence to answer that confidently.',
      verdict: grounded ? String(parsed.verdict || 'supported') : 'not_found',
      confidence: grounded ? String(parsed.confidence || 'medium') : 'low',
      citations,
      trace: [
        { label: 'Retrieved approved canon via MCP', detail: `${evidence.length} locked evidence row${evidence.length === 1 ? '' : 's'} loaded through ${via}.` },
        { label: 'Gemini answered the question', detail: 'The response was constrained to the approved evidence rows.' },
        { label: 'Validated source citations', detail: `${citations.length} citation${citations.length === 1 ? '' : 's'} matched retrieved evidence.` },
        { label: 'Human approval remains required', detail: 'The answer does not change canon or lock new facts.' }
      ]
    };
  } finally {
    await clickhouse.close();
  }
}

const server = createServer(async (request, response) => {
  if (request.url === '/api/health') {
    const mcpReady = await clickHouseMcpHealthy();
    return json(response, 200, { configured: configured() && mcpReady, provider: 'Gemini Enterprise + ClickHouse MCP', clickhouseMcp: mcpReady });
  }
  if (request.url === '/api/agent/review' && request.method === 'POST') {
    if (!(configured() && await clickHouseMcpHealthy())) return json(response, 503, { error: 'Cloud review is not ready. Set Google Cloud/ClickHouse variables and start the local ClickHouse MCP sidecar.' });
    if (reviewRateLimited(request)) return json(response, 429, { error: 'Cloud review limit reached. Try again in 15 minutes.' });
    try { return json(response, 200, await reviewWithCloud(await readJson(request))); }
    catch (error) { return json(response, 400, { error: error.message || 'Cloud review failed.' }); }
  }
  if (request.url === '/api/agent/canon-candidates' && request.method === 'POST') {
    if (!(configured() && await clickHouseMcpHealthy())) return json(response, 503, { error: 'AI canon extraction is not ready. Set Google Cloud/ClickHouse variables and start the local ClickHouse MCP sidecar.' });
    if (reviewRateLimited(request)) return json(response, 429, { error: 'AI request limit reached. Try again in 15 minutes.' });
    try { return json(response, 200, await extractCanonCandidatesWithCloud(await readJson(request))); }
    catch (error) { return json(response, 400, { error: error.message || 'AI canon extraction failed.' }); }
  }
  if (request.url === '/api/agent/ask-canon' && request.method === 'POST') {
    if (!(configured() && await clickHouseMcpHealthy())) return json(response, 503, { error: 'Ask the canon is not ready. Set Google Cloud/ClickHouse variables and start the local ClickHouse MCP sidecar.' });
    if (reviewRateLimited(request)) return json(response, 429, { error: 'AI request limit reached. Try again in 15 minutes.' });
    try { return json(response, 200, await askCanonWithCloud(await readJson(request))); }
    catch (error) { return json(response, 400, { error: error.message || 'Ask the canon failed.' }); }
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
