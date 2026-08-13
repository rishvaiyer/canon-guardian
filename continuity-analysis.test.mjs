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
  assert.equal(result.metrics.unsupported_findings_excluded, 1);
});

test('preserves old string repair options while adding scores', () => {
  const result = normalizeReview({ findings: [{ evidence: 'Mara keeps the brass key', repair_options: ['Move the key before the handoff'], smallest_repair: 'Move the key before the handoff' }] }, evidence);
  const finding = result.findings[0];
  assert.deepEqual(finding.repair_options, ['Move the key before the handoff']);
  assert.equal(typeof finding.repair_plan[0].score, 'number');
  assert.equal(finding.repair_plan[0].rank, 1);
});

test('rejects out-of-range evidence indexes and returns no unsupported findings', () => {
  const result = normalizeReview({ findings: [{ evidence_indices: [99], title: 'Should be ignored' }] }, evidence);
  assert.equal(result.findings.length, 0);
  assert.equal(result.metrics.unsupported_findings_excluded, 1);
});
