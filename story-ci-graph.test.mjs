import test from 'node:test';
import assert from 'node:assert/strict';
import { clampGraphPosition, createStoryCIGraph, graphRunStages } from './story-ci-graph.mjs';

const manifest = {
  revision: 'Episode 2',
  canon: [{ id: 'death', label: 'Jonah dies', evidence: 'Episode 1, line 18' }]
};
const report = {
  verdict: 'BLOCK', counts: { PASS: 0, REVIEW: 0, BLOCK: 1 },
  checks: [{ id: 'return', title: 'Jonah returns', severity: 'HIGH', outcome: 'BLOCK', reason: 'Unresolved.', evidenceIds: ['death'], downstream: ['Finale'], summary: 'The fixed point changes.' }]
};

test('builds an evidence-to-finding-to-gate graph with labeled impact', () => {
  const graph = createStoryCIGraph(manifest, report);
  assert.ok(graph.nodes.some((node) => node.id === 'canon:death'));
  assert.ok(graph.nodes.some((node) => node.id === 'gate' && node.outcome === 'BLOCK'));
  assert.ok(graph.edges.some((edge) => edge.from === 'canon:death' && edge.to === 'finding:return' && edge.label === 'PROVES'));
  assert.ok(graph.edges.some((edge) => edge.to === 'impact:Finale' && edge.label === 'AFFECTS'));
});

test('run stages end at the deterministic gate', () => {
  const stages = graphRunStages(createStoryCIGraph(manifest, report));
  assert.equal(stages.length, 4);
  assert.deepEqual(stages.at(-1).nodes, ['gate']);
});

test('drag coordinates remain inside the usable map', () => {
  assert.equal(clampGraphPosition(-10), 7);
  assert.equal(clampGraphPosition(108), 93);
  assert.equal(clampGraphPosition(44), 44);
});
