const SEVERITY_WEIGHTS = Object.freeze({
  critical: 100,
  high: 82,
  medium: 62,
  low: 40
});

const SCORE_WEIGHTS = Object.freeze({
  evidence: 0.30,
  contradiction: 0.25,
  blast_radius: 0.25,
  timeline: 0.10,
  confidence: 0.10
});

const LEVEL_SCORE = Object.freeze({ high: 100, medium: 65, low: 30 });
const IMPACT_SCOPE_SCORE = Object.freeze({ scene: 25, episode: 60, season: 85, series: 100 });
const TYPE_CONTRADICTION_SCORE = Object.freeze({
  direct_contradiction: 100,
  timeline_impossibility: 95,
  knowledge_leak: 88,
  character_state_conflict: 84,
  relationship_drift: 72,
  prop_location_mismatch: 68,
  setup_payoff_gap: 62,
  needs_review: 35
});

const TYPE_ALIASES = Object.freeze({
  contradiction: 'direct_contradiction',
  conflict: 'direct_contradiction',
  direct: 'direct_contradiction',
  timeline: 'timeline_impossibility',
  chronology: 'timeline_impossibility',
  knowledge: 'knowledge_leak',
  knowledge_leak: 'knowledge_leak',
  state: 'character_state_conflict',
  character: 'character_state_conflict',
  relationship: 'relationship_drift',
  prop: 'prop_location_mismatch',
  location: 'prop_location_mismatch',
  setup: 'setup_payoff_gap',
  payoff: 'setup_payoff_gap',
  ambiguity: 'needs_review',
  uncertain: 'needs_review'
});

export const CONTINUITY_FINDING_TYPES = Object.freeze([
  'direct_contradiction',
  'timeline_impossibility',
  'knowledge_leak',
  'character_state_conflict',
  'relationship_drift',
  'prop_location_mismatch',
  'setup_payoff_gap',
  'needs_review'
]);

function text(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function enumValue(value, allowed, fallback) {
  const normalized = text(value).toLowerCase().replace(/[\s-]+/g, '_');
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeFindingType(value) {
  const normalized = text(value).toLowerCase().replace(/[\s-]+/g, '_');
  return CONTINUITY_FINDING_TYPES.includes(normalized) ? normalized : TYPE_ALIASES[normalized] || 'needs_review';
}

function boundedList(value, limit = 6) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item)).filter(Boolean).slice(0, limit);
}

function evidenceIndices(raw, evidence) {
  const explicit = Array.isArray(raw.evidence_indices)
    ? raw.evidence_indices.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < evidence.length)
    : [];
  if (explicit.length) return [...new Set(explicit)];

  const needle = text(raw.evidence).toLowerCase();
  if (!needle) return [];
  const match = evidence.findIndex((row) => {
    const haystack = [row.source_name, row.scene_label, row.line_number, row.excerpt].map((item) => text(item).toLowerCase());
    if (haystack.some((value) => value && needle.includes(value)) || haystack.filter(Boolean).join(' · ').includes(needle)) return true;
    const tokens = needle.split(/[^a-z0-9]+/).filter((token) => token.length > 2);
    const rowText = haystack.join(' ');
    return tokens.length >= 2 && tokens.filter((token) => rowText.includes(token)).length >= Math.min(3, tokens.length);
  });
  return match >= 0 ? [match] : [];
}

function evidenceLabel(row) {
  if (!row) return '';
  return [text(row.source_name, 'Source'), text(row.scene_label, 'Scene'), row.line_number ? `line ${row.line_number}` : ''].filter(Boolean).join(' · ');
}

function scoreEvidence(citedRows, evidenceExcerpt) {
  if (!citedRows.length) return 0;
  const exactRows = citedRows.filter((row) => text(row?.source_name) && text(row?.excerpt) && Number(row?.line_number) > 0).length;
  const excerpt = text(evidenceExcerpt).toLowerCase();
  const excerptMatch = excerpt && citedRows.some((row) => {
    const rowExcerpt = text(row?.excerpt).toLowerCase();
    return rowExcerpt && (excerpt.includes(rowExcerpt) || rowExcerpt.includes(excerpt));
  });
  const corroboration = Math.min(20, Math.max(0, citedRows.length - 1) * 10);
  return Math.min(100, 55 + Math.round((exactRows / citedRows.length) * 25) + (excerptMatch ? 20 : 0) + corroboration);
}

function scoreContradiction(type, status, strength) {
  const base = TYPE_CONTRADICTION_SCORE[type] || TYPE_CONTRADICTION_SCORE.needs_review;
  const inferred = type === 'needs_review' ? 'low' : (type === 'relationship_drift' || type === 'setup_payoff_gap' ? 'medium' : 'high');
  const level = enumValue(strength, ['high', 'medium', 'low'], inferred);
  const blended = base * 0.6 + LEVEL_SCORE[level] * 0.4;
  const statusMultiplier = { confirmed: 1, probable: 0.82, needs_review: 0.58 }[status] || 0.7;
  return Math.round(blended * statusMultiplier);
}

function scoreBlastRadius(downstreamBeats, impactScope) {
  const count = Math.min(45, downstreamBeats.length * 12);
  const scope = IMPACT_SCOPE_SCORE[impactScope] || IMPACT_SCOPE_SCORE.scene;
  return Math.min(100, Math.round(scope * 0.55 + count));
}

function scoreTimeline(type, status, certainty) {
  const base = type === 'timeline_impossibility' ? 100 : type === 'knowledge_leak' ? 85 : 60;
  const inferred = type === 'timeline_impossibility' || type === 'knowledge_leak' ? 'high' : 'medium';
  const level = enumValue(certainty, ['high', 'medium', 'low'], inferred);
  const blended = base * 0.6 + LEVEL_SCORE[level] * 0.4;
  const multiplier = { confirmed: 1, probable: 0.8, needs_review: 0.55 }[status] || 0.7;
  return Math.round(blended * multiplier);
}

function scoreConfidence(confidence) {
  return LEVEL_SCORE[confidence] || LEVEL_SCORE.medium;
}

function scoreFinding({ findingType, status, confidence, contradictionStrength, timelineCertainty, citedRows, evidenceExcerpt, downstreamBeats, impactScope }) {
  const breakdown = {
    evidence: scoreEvidence(citedRows, evidenceExcerpt),
    contradiction: scoreContradiction(findingType, status, contradictionStrength),
    blast_radius: scoreBlastRadius(downstreamBeats, impactScope),
    timeline: scoreTimeline(findingType, status, timelineCertainty),
    confidence: scoreConfidence(confidence)
  };
  const score = Math.round(Object.entries(SCORE_WEIGHTS).reduce((total, [key, weight]) => total + breakdown[key] * weight, 0));
  const rationale = `Evidence ${breakdown.evidence}/100 · contradiction ${breakdown.contradiction}/100 · blast radius ${breakdown.blast_radius}/100 · timeline ${breakdown.timeline}/100 · Gemini confidence ${breakdown.confidence}/100.`;
  return { score, breakdown, rationale };
}

function scoreRepair(option) {
  const canon = enumValue(option.canon_preservation || option.canonPreservation, ['high', 'medium', 'low'], 'medium');
  const risk = enumValue(option.downstream_risk || option.downstreamRisk, ['high', 'medium', 'low'], 'medium');
  const blast = enumValue(option.blast_radius_reduction || option.blastRadiusReduction, ['high', 'medium', 'low'], risk === 'high' ? 'low' : risk === 'low' ? 'high' : 'medium');
  const effort = enumValue(option.edit_effort || option.editEffort, ['high', 'medium', 'low'], 'medium');
  const confidence = enumValue(option.confidence, ['high', 'medium', 'low'], 'medium');
  const score = Math.round(
    SEVERITY_WEIGHTS[canon] * 0.4
      + LEVEL_SCORE[blast] * 0.3
      + SEVERITY_WEIGHTS[{ low: 'high', medium: 'medium', high: 'low' }[effort]] * 0.2
      + SEVERITY_WEIGHTS[confidence] * 0.1
  );
  const rationale = `Preserves ${canon} canon, delivers ${blast} blast-radius reduction, and requires ${effort} rewrite effort.`;
  return {
    score,
    score_breakdown: { canon_preservation: SEVERITY_WEIGHTS[canon], blast_radius_reduction: LEVEL_SCORE[blast], edit_effort: SEVERITY_WEIGHTS[{ low: 'high', medium: 'medium', high: 'low' }[effort]], confidence: SEVERITY_WEIGHTS[confidence] },
    canon_preservation: canon,
    downstream_risk: risk,
    blast_radius_reduction: blast,
    edit_effort: effort,
    confidence,
    rationale
  };
}

function normalizeRepairOptions(raw, smallestRepair) {
  const source = Array.isArray(raw.repair_options) ? raw.repair_options : [];
  const options = source.map((option) => {
    if (typeof option === 'string') return { label: text(option), description: text(option) };
    return {
      label: text(option?.label || option?.title || option?.description),
      description: text(option?.description || option?.label || option?.title),
      tradeoffs: boundedList(option?.tradeoffs, 3),
      ...scoreRepair(option || {})
    };
  }).filter((option) => option.label);
  if (!options.length && smallestRepair) options.push({ label: smallestRepair, description: smallestRepair, ...scoreRepair({}) });

  const scored = options.map((option) => ({ ...option, ...(option.score ? {} : scoreRepair(option)) }));
  return scored.sort((left, right) => right.score - left.score).slice(0, 4).map((option, index) => ({ ...option, rank: index + 1, recommended: index === 0 }));
}

export function normalizeReview(review, evidence) {
  const rows = Array.isArray(evidence) ? evidence : [];
  const rawFindings = Array.isArray(review?.findings) ? review.findings : [];
  const findings = rawFindings.map((raw) => {
    const indices = evidenceIndices(raw || {}, rows);
    if (!indices.length) return null;
    const citedRows = indices.map((index) => rows[index]).filter(Boolean);
    const smallestRepair = text(raw.smallest_repair || raw.smallestRepair);
    const repairPlan = normalizeRepairOptions(raw || {}, smallestRepair);
    const repairOptions = repairPlan.map((option) => option.label);
    const severity = enumValue(raw.severity, ['critical', 'high', 'medium', 'low'], 'medium');
    const confidence = enumValue(raw.confidence, ['high', 'medium', 'low'], 'medium');
    const findingType = normalizeFindingType(raw.finding_type || raw.type || raw.category);
    const status = enumValue(raw.status, ['confirmed', 'probable', 'needs_review'], 'confirmed');
    const downstreamBeats = boundedList(raw.downstream_beats || raw.downstreamBeats);
    const impactScope = enumValue(raw.impact_scope || raw.impactScope, ['scene', 'episode', 'season', 'series'], 'scene');
    const evidenceExcerpt = text(raw.evidence_excerpt || raw.excerpt) || text(citedRows[0]?.excerpt);
    const score = scoreFinding({
      findingType,
      status,
      confidence,
      contradictionStrength: raw.contradiction_strength || raw.contradictionStrength,
      timelineCertainty: raw.timeline_certainty || raw.timelineCertainty,
      citedRows,
      evidenceExcerpt,
      downstreamBeats,
      impactScope
    });
    return {
      severity,
      confidence,
      finding_type: findingType,
      status,
      title: text(raw.title, 'Continuity concern'),
      why: text(raw.why || raw.explanation, 'The incoming draft conflicts with approved canon evidence.'),
      evidence: text(raw.evidence) || evidenceLabel(citedRows[0]),
      evidence_indices: indices,
      evidence_rows: citedRows,
      evidence_excerpt: evidenceExcerpt,
      downstream_beats: downstreamBeats,
      impact_scope: impactScope,
      finding_score: score.score,
      score_breakdown: score.breakdown,
      score_rationale: score.rationale,
      repair_options: repairOptions,
      repair_plan: repairPlan,
      smallest_repair: smallestRepair || repairOptions[0] || 'Editor review required.'
    };
  }).filter(Boolean).sort((left, right) => right.finding_score - left.finding_score).slice(0, 12).map((finding, index) => ({ ...finding, priority_rank: index + 1 }));

  const typeCounts = Object.fromEntries(CONTINUITY_FINDING_TYPES.map((type) => [type, findings.filter((finding) => finding.finding_type === type).length]));
  const severityCounts = Object.fromEntries(['critical', 'high', 'medium', 'low'].map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length]));
  const scores = findings.map((finding) => finding.finding_score);
  return {
    summary: text(review?.summary, findings.length ? `${findings.length} evidence-backed continuity concern${findings.length === 1 ? '' : 's'} found.` : 'No evidence-backed continuity concerns returned.'),
    findings,
    analysis_version: 'continuity-crew-v2',
    taxonomy: { finding_types: CONTINUITY_FINDING_TYPES, counts: typeCounts },
    metrics: { total_findings: findings.length, severity_counts: severityCounts, cited_findings: findings.length, unsupported_findings_excluded: Math.max(0, rawFindings.length - findings.length), repairable_findings: findings.filter((finding) => finding.repair_plan.length > 0).length, score_average: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0, highest_score: scores.length ? Math.max(...scores) : 0 }
  };
}
