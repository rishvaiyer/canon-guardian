const SEVERITY_WEIGHTS = Object.freeze({
  critical: 100,
  high: 82,
  medium: 62,
  low: 40
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

function scoreRepair(option) {
  const canon = enumValue(option.canon_preservation || option.canonPreservation, ['high', 'medium', 'low'], 'medium');
  const risk = enumValue(option.downstream_risk || option.downstreamRisk, ['high', 'medium', 'low'], 'medium');
  const effort = enumValue(option.edit_effort || option.editEffort, ['high', 'medium', 'low'], 'medium');
  const confidence = enumValue(option.confidence, ['high', 'medium', 'low'], 'medium');
  const score = Math.round(
    SEVERITY_WEIGHTS[canon] * 0.4
      + SEVERITY_WEIGHTS[{ low: 'high', medium: 'medium', high: 'low' }[risk]] * 0.3
      + SEVERITY_WEIGHTS[{ low: 'high', medium: 'medium', high: 'low' }[effort]] * 0.2
      + SEVERITY_WEIGHTS[confidence] * 0.1
  );
  const rationale = `Preserves ${canon} canon, ${risk} downstream risk, and ${effort} rewrite effort.`;
  return { score, canon_preservation: canon, downstream_risk: risk, edit_effort: effort, confidence, rationale };
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
    return {
      severity: enumValue(raw.severity, ['critical', 'high', 'medium', 'low'], 'medium'),
      confidence: enumValue(raw.confidence, ['high', 'medium', 'low'], 'medium'),
      finding_type: normalizeFindingType(raw.finding_type || raw.type || raw.category),
      status: enumValue(raw.status, ['confirmed', 'probable', 'needs_review'], 'confirmed'),
      title: text(raw.title, 'Continuity concern'),
      why: text(raw.why || raw.explanation, 'The incoming draft conflicts with approved canon evidence.'),
      evidence: text(raw.evidence) || evidenceLabel(citedRows[0]),
      evidence_indices: indices,
      evidence_rows: citedRows,
      evidence_excerpt: text(raw.evidence_excerpt || raw.excerpt) || text(citedRows[0]?.excerpt),
      downstream_beats: boundedList(raw.downstream_beats || raw.downstreamBeats),
      impact_scope: enumValue(raw.impact_scope || raw.impactScope, ['scene', 'episode', 'season', 'series'], 'scene'),
      repair_options: repairOptions,
      repair_plan: repairPlan,
      smallest_repair: smallestRepair || repairOptions[0] || 'Editor review required.'
    };
  }).filter(Boolean).slice(0, 12);

  const typeCounts = Object.fromEntries(CONTINUITY_FINDING_TYPES.map((type) => [type, findings.filter((finding) => finding.finding_type === type).length]));
  const severityCounts = Object.fromEntries(['critical', 'high', 'medium', 'low'].map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length]));
  return {
    summary: text(review?.summary, findings.length ? `${findings.length} evidence-backed continuity concern${findings.length === 1 ? '' : 's'} found.` : 'No evidence-backed continuity concerns returned.'),
    findings,
    analysis_version: 'continuity-crew-v2',
    taxonomy: { finding_types: CONTINUITY_FINDING_TYPES, counts: typeCounts },
    metrics: { total_findings: findings.length, severity_counts: severityCounts, cited_findings: findings.length, unsupported_findings_excluded: Math.max(0, rawFindings.length - findings.length), repairable_findings: findings.filter((finding) => finding.repair_plan.length > 0).length }
  };
}
