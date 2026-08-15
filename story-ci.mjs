const SEVERITY_ORDER = Object.freeze({ INFO: 0, LOW: 1, MEDIUM: 2, REVIEW: 2, HIGH: 3, CRITICAL: 4 });

function cleanString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeSeverity(value) {
  const severity = cleanString(value, 'REVIEW').toUpperCase();
  return Object.hasOwn(SEVERITY_ORDER, severity) ? severity : 'REVIEW';
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeCanon(facts = []) {
  const seen = new Set();
  return facts.flatMap((fact, index) => {
    const id = cleanString(fact?.id, `canon-${index + 1}`);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      label: cleanString(fact?.label, `Canon fact ${index + 1}`),
      type: cleanString(fact?.type, 'story_fact'),
      evidence: cleanString(fact?.evidence || fact?.evidenceRef),
      source: cleanString(fact?.source)
    }];
  });
}

function normalizeFindings(findings = []) {
  const seen = new Set();
  return findings.flatMap((finding, index) => {
    const id = cleanString(finding?.id, `finding-${index + 1}`);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      title: cleanString(finding?.title, `Continuity finding ${index + 1}`),
      severity: normalizeSeverity(finding?.severity),
      status: cleanString(finding?.status, 'open').toLowerCase(),
      evidenceIds: [...new Set((Array.isArray(finding?.evidenceIds) ? finding.evidenceIds : []).map((value) => cleanString(value)).filter(Boolean))],
      downstream: [...new Set((Array.isArray(finding?.downstream) ? finding.downstream : []).map((value) => cleanString(value)).filter(Boolean))],
      summary: cleanString(finding?.summary)
    }];
  });
}

export function normalizeStoryCIManifest(input = {}) {
  const policyInput = input.policy || {};
  return {
    schema: 'canoncue.story-ci/v1',
    project: cleanString(input.project, 'Untitled story'),
    revision: cleanString(input.revision, 'Working revision'),
    policy: {
      blockAt: normalizeSeverity(policyInput.blockAt || 'HIGH'),
      requireEvidence: policyInput.requireEvidence !== false,
      maxOpenReview: Number.isFinite(policyInput.maxOpenReview) ? Math.max(0, Math.floor(policyInput.maxOpenReview)) : 99
    },
    canon: normalizeCanon(input.canon),
    findings: normalizeFindings(input.findings)
  };
}

export async function evaluateStoryCI(input = {}, baseline = null) {
  const manifest = normalizeStoryCIManifest(input);
  const canonIds = new Set(manifest.canon.map((fact) => fact.id));
  const terminalStatuses = new Set(['accepted_repair', 'marked_intentional', 'dismissed', 'resolved', 'closed']);
  const blockRank = SEVERITY_ORDER[manifest.policy.blockAt];
  const checks = manifest.findings.map((finding) => {
    const invalidEvidence = finding.evidenceIds.filter((id) => !canonIds.has(id));
    const evidenceValid = finding.evidenceIds.length > 0 && invalidEvidence.length === 0;
    const resolved = terminalStatuses.has(finding.status);
    let outcome = 'PASS';
    let reason = resolved ? `Editorial decision recorded: ${finding.status.replaceAll('_', ' ')}.` : 'No release-blocking condition.';
    if (!resolved && manifest.policy.requireEvidence && !evidenceValid) {
      outcome = 'BLOCK';
      reason = invalidEvidence.length ? `Unknown evidence: ${invalidEvidence.join(', ')}.` : 'No approved canon evidence attached.';
    } else if (!resolved && SEVERITY_ORDER[finding.severity] >= blockRank) {
      outcome = 'BLOCK';
      reason = `${finding.severity} continuity break is unresolved.`;
    } else if (!resolved) {
      outcome = 'REVIEW';
      reason = `${finding.severity} finding requires editorial review.`;
    }
    return { ...finding, outcome, evidenceValid, invalidEvidence, reason };
  });

  const counts = checks.reduce((result, check) => ({ ...result, [check.outcome]: result[check.outcome] + 1 }), { PASS: 0, REVIEW: 0, BLOCK: 0 });
  const verdict = counts.BLOCK ? 'BLOCK' : counts.REVIEW > manifest.policy.maxOpenReview ? 'BLOCK' : counts.REVIEW ? 'REVIEW' : 'PASS';
  const hash = await sha256(manifest);
  const previous = baseline && typeof baseline === 'object' ? baseline : null;
  const comparison = previous ? {
    previousVerdict: cleanString(previous.verdict, 'UNKNOWN'),
    verdictChanged: cleanString(previous.verdict) !== verdict,
    blockedDelta: counts.BLOCK - Number(previous.counts?.BLOCK || 0),
    reviewDelta: counts.REVIEW - Number(previous.counts?.REVIEW || 0),
    sameManifest: cleanString(previous.hash) === hash
  } : null;

  return {
    schema: 'canoncue.story-ci-report/v1',
    project: manifest.project,
    revision: manifest.revision,
    verdict,
    hash,
    counts,
    policy: manifest.policy,
    checks,
    comparison
  };
}

export function reportSummary(report) {
  return `${report.verdict}: ${report.counts.PASS} passed, ${report.counts.REVIEW} review, ${report.counts.BLOCK} blocked · ${report.hash.slice(0, 12)}`;
}
