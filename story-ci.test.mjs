import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, evaluateStoryCI } from './story-ci.mjs';

const canon = [{ id: 'death', label: 'Jonah dies', evidence: 'Episode 1, line 18' }];

test('canonical JSON is stable across object insertion order', () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, b: 3 } }), canonicalJson({ a: { b: 3, y: 2 }, z: 1 }));
});

test('blocks an unresolved high finding with approved evidence', async () => {
  const report = await evaluateStoryCI({ project: 'Last Loop', canon, findings: [{ id: 'return', title: 'Jonah returns', severity: 'HIGH', evidenceIds: ['death'] }] });
  assert.equal(report.verdict, 'BLOCK');
  assert.equal(report.counts.BLOCK, 1);
  assert.equal(report.checks[0].evidenceValid, true);
});

test('blocks missing or forged evidence even below the severity threshold', async () => {
  const report = await evaluateStoryCI({ canon, findings: [{ id: 'prop', severity: 'LOW', evidenceIds: ['unknown'] }] });
  assert.equal(report.verdict, 'BLOCK');
  assert.deepEqual(report.checks[0].invalidEvidence, ['unknown']);
});

test('passes a finding after an explicit editorial decision', async () => {
  const report = await evaluateStoryCI({ canon, findings: [{ id: 'return', severity: 'CRITICAL', status: 'marked_intentional', evidenceIds: ['death'] }] });
  assert.equal(report.verdict, 'PASS');
  assert.equal(report.counts.PASS, 1);
});

test('produces the same hash for semantically identical manifests', async () => {
  const left = await evaluateStoryCI({ project: 'A', canon, findings: [] });
  const right = await evaluateStoryCI({ findings: [], canon, project: 'A' });
  assert.equal(left.hash, right.hash);
  assert.match(left.hash, /^[a-f0-9]{64}$/);
});

test('compares a run with a promoted baseline', async () => {
  const baseline = await evaluateStoryCI({ canon, findings: [] });
  const report = await evaluateStoryCI({ canon, findings: [{ id: 'return', severity: 'HIGH', evidenceIds: ['death'] }] }, baseline);
  assert.equal(report.comparison.previousVerdict, 'PASS');
  assert.equal(report.comparison.verdictChanged, true);
  assert.equal(report.comparison.blockedDelta, 1);
});
