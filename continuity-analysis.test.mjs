import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReview } from './continuity-analysis.mjs';

const evidence = [
  { source_name: 'episode-1.txt', scene_label: 'INT. CLINIC - NIGHT', line_number: 18, excerpt: 'Jonah dies on the operating table.' },
  { source_name: 'episode-1.txt', scene_label: 'EXT. STATION - DAWN', line_number: 42, excerpt: 'Mara keeps the brass key.' }
];

test('normalizes Gemini findings into an evidence-gated taxonomy', () => {
  const result = normalizeReview({
    summary: 'One break found.',
    findings: [
      {
        type: 'contradiction',
        severity: 'HIGH',
        confidence: 'high',
        title: 'Jonah returns after death',
        why: 'The incoming scene shows Jonah alive after the locked death.',
        evidence_indices: [0],
        downstream_beats: ['Jonah confronts Mara in the finale'],
        repair_options: [
          { label: 'Change the entrance to a memory', canon_preservation: 'high', downstream_risk: 'low', edit_effort: 'low', confidence: 'high' },
          { label: 'Retcon the clinic death', canon_preservation: 'low', downstream_risk: 'high', edit_effort: 'high', confidence: 'low' }
        ]
      },
      { title: 'Unsupported claim', why: 'No citation.' }
    ]
  }, evidence);

  assert.equal(result.analysis_version, 'continuity-crew-v2');
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].finding_type, 'direct_contradiction');
  assert.deepEqual(result.findings[0].evidence_indices, [0]);
  assert.equal(result.findings[0].repair_plan[0].label, 'Change the entrance to a memory');
  assert.equal(result.findings[0].repair_plan[0].recommended, true);
  assert.equal(typeof result.findings[0].finding_score, 'number');
  assert.deepEqual(Object.keys(result.findings[0].score_breakdown), ['evidence', 'contradiction', 'blast_radius', 'timeline', 'confidence']);
  assert.equal(result.metrics.score_average, result.findings[0].finding_score);
  assert.equal(result.metrics.unsupported_findings_excluded, 1);
});

test('preserves old string repair options while adding scores', () => {
  const result = normalizeReview({ findings: [{ evidence: 'Mara keeps the brass key', repair_options: ['Move the key before the handoff'], smallest_repair: 'Move the key before the handoff' }] }, evidence);
  const finding = result.findings[0];
  assert.deepEqual(finding.repair_options, ['Move the key before the handoff']);
  assert.equal(typeof finding.repair_plan[0].score, 'number');
  assert.equal(finding.repair_plan[0].rank, 1);
  assert.equal(typeof finding.repair_plan[0].score_breakdown.blast_radius_reduction, 'number');
});

test('prioritizes a supported series-level break over a local review note', () => {
  const result = normalizeReview({ findings: [
    {
      finding_type: 'direct_contradiction',
      status: 'confirmed',
      confidence: 'high',
      contradiction_strength: 'high',
      timeline_certainty: 'high',
      evidence_indices: [0, 1],
      downstream_beats: ['Jonah confronts Mara in episode 4', 'Mara burns the key in episode 5', 'The finale depends on Jonah being gone'],
      impact_scope: 'series',
      title: 'Locked death is reversed'
    },
    {
      finding_type: 'needs_review',
      status: 'needs_review',
      confidence: 'low',
      evidence_indices: [1],
      downstream_beats: [],
      impact_scope: 'scene',
      title: 'Prop placement is unclear'
    }
  ] }, evidence);

  assert.equal(result.findings.length, 2);
  assert.ok(result.findings[0].finding_score > result.findings[1].finding_score);
  assert.ok(result.metrics.highest_score >= result.findings[0].finding_score);
});

test('rejects out-of-range evidence indexes and returns no unsupported findings', () => {
  const result = normalizeReview({ findings: [{ evidence_indices: [99], title: 'Should be ignored' }] }, evidence);
  assert.equal(result.findings.length, 0);
  assert.equal(result.metrics.unsupported_findings_excluded, 1);
});
