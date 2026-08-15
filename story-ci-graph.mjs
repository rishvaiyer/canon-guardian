function clean(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function evenlySpaced(index, count, top = 18, bottom = 82) {
  if (count <= 1) return (top + bottom) / 2;
  return top + ((bottom - top) * index) / (count - 1);
}

export function clampGraphPosition(value, minimum = 7, maximum = 93) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

export function createStoryCIGraph(manifest, report) {
  const canon = (manifest?.canon || []).slice(0, 4);
  const findings = (report?.checks || []).slice(0, 5);
  const downstreamLabels = [...new Set(findings.flatMap((finding) => finding.downstream || []))].slice(0, 5);
  const nodes = [];
  const edges = [];

  nodes.push({
    id: 'revision', type: 'revision', kicker: 'INCOMING REVISION',
    label: clean(manifest?.revision, 'Working revision'), x: 12, y: 11,
    summary: 'The draft being tested against approved canon.',
    detail: 'Every open finding starts in this revision. Story CI never changes the draft; it decides whether the revision is safe to promote.'
  });

  canon.forEach((fact, index) => nodes.push({
    id: `canon:${fact.id}`, type: 'canon', kicker: 'APPROVED CANON', label: fact.label,
    x: 12, y: evenlySpaced(index, canon.length, 31, 86),
    summary: clean(fact.evidence, 'Approved evidence'),
    detail: `This locked fact is trusted evidence${fact.source ? ` from ${fact.source}` : ''}. A finding must cite approved evidence before it can influence the release gate.`
  }));

  findings.forEach((finding, index) => {
    const nodeId = `finding:${finding.id}`;
    nodes.push({
      id: nodeId, type: 'finding', outcome: finding.outcome, kicker: `${finding.severity} · ${finding.outcome}`,
      label: finding.title, x: 47, y: evenlySpaced(index, findings.length, 18, 84),
      summary: finding.reason,
      detail: finding.downstream?.length
        ? `This finding affects ${finding.downstream.length} downstream beat${finding.downstream.length === 1 ? '' : 's'}. ${finding.summary || ''}`.trim()
        : clean(finding.summary, 'No downstream beats are attached to this finding.')
    });
    edges.push({ id: `revision:${finding.id}`, from: 'revision', to: nodeId, label: 'INTRODUCES', kind: 'revision' });
    (finding.evidenceIds || []).forEach((evidenceId) => {
      if (canon.some((fact) => fact.id === evidenceId)) edges.push({ id: `evidence:${evidenceId}:${finding.id}`, from: `canon:${evidenceId}`, to: nodeId, label: 'PROVES', kind: 'evidence' });
    });
    edges.push({ id: `gate:${finding.id}`, from: nodeId, to: 'gate', label: 'CHECKED', kind: finding.outcome.toLowerCase() });
    (finding.downstream || []).forEach((label) => {
      if (downstreamLabels.includes(label)) edges.push({ id: `impact:${finding.id}:${label}`, from: nodeId, to: `impact:${label}`, label: 'AFFECTS', kind: 'impact' });
    });
  });

  nodes.push({
    id: 'gate', type: 'gate', outcome: report?.verdict || 'REVIEW', kicker: 'DETERMINISTIC GATE',
    label: report?.verdict === 'PASS' ? 'Safe to promote' : report?.verdict === 'BLOCK' ? 'Promotion blocked' : 'Editor review needed',
    x: 84, y: 11, summary: `${report?.counts?.BLOCK || 0} blocked · ${report?.counts?.REVIEW || 0} review · ${report?.counts?.PASS || 0} passed`,
    detail: 'The gate uses approved evidence, severity, and recorded editorial decisions. An AI finding cannot overrule this deterministic result.'
  });

  downstreamLabels.forEach((label, index) => nodes.push({
    id: `impact:${label}`, type: 'impact', kicker: 'DOWNSTREAM BEAT', label,
    x: 84, y: evenlySpaced(index, downstreamLabels.length, 35, 87),
    summary: 'A later scene or beat affected by the finding.',
    detail: 'This impact link explains why the continuity break matters beyond a single line. Fix the source break or review this downstream beat.'
  }));

  return { nodes, edges };
}

export function graphRunStages(graph) {
  const byType = (type) => graph.nodes.filter((node) => node.type === type).map((node) => node.id);
  return [
    { label: '1 · Read approved canon evidence', nodes: byType('canon') },
    { label: '2 · Compare the incoming revision', nodes: ['revision', ...byType('finding')] },
    { label: '3 · Trace downstream impact', nodes: byType('impact') },
    { label: '4 · Apply the deterministic release rule', nodes: ['gate'] }
  ];
}
