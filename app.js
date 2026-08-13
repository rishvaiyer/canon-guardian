const issues = {
  code: {
    number: 'BREAK 01', title: 'Knowledge arrives five minutes early', severity: 'CRITICAL',
    summary: 'Maya opens locker 441 with a code she has not learned yet.',
    heading: 'The reveal loses its engine.',
    copy: 'If Maya knows 1987 here, the voice memo in Scene 23 no longer reveals anything — and the final loop cannot reframe the earlier scenes.',
    evidence: 'LOCKED FACT · Scene 23, p.10',
    nodes: [
      ['SCENE 19', 'Maya opens locker 441', 'Revision claim'],
      ['SCENE 23', 'Voice memo reveals “1987”', 'No longer a reveal'],
      ['SCENE 26', 'Maya loops back with the code', 'Loop loses purpose']
    ]
  },
  phone: {
    number: 'BREAK 02', title: 'A dead phone receives a text', severity: 'HIGH',
    summary: 'Jonah’s burner phone powers on after its battery dies in Scene 14.',
    heading: 'The phone’s final signal becomes impossible.',
    copy: 'The battery death is why Maya preserves the voicemail. Making it functional here removes the reason she must follow its recorded instructions.',
    evidence: 'LOCKED FACT · Scene 14, p.6',
    nodes: [
      ['SCENE 14', 'Battery dies at 11:31', 'Established limit'],
      ['SCENE 19', 'Screen wakes; text sent', 'Revision claim'],
      ['SCENE 22', 'Maya plays the only saved memo', 'Motivation breaks']
    ]
  },
  wrist: {
    number: 'BREAK 03', title: 'The fracture changes hands', severity: 'HIGH',
    summary: 'Maya texts with the left hand established as unusable.',
    heading: 'The physical cost disappears.',
    copy: 'Her injury forces her to ask the station clerk for help in Scene 21. That choice starts their mistrust-to-alliance arc.',
    evidence: 'LOCKED FACT · Scene 11, p.4',
    nodes: [
      ['SCENE 11', 'Left wrist fractures', 'Physical constraint'],
      ['SCENE 19', 'Texts with left hand', 'Revision claim'],
      ['SCENE 21', 'Clerk helps Maya dial', 'Alliance never starts']
    ]
  },
  jonah: {
    number: 'BREAK 04', title: 'A dead man enters the station', severity: 'CRITICAL',
    summary: 'Jonah appears alive after his on-page death.',
    heading: 'The mystery becomes a different story.',
    copy: 'Jonah’s death is the story’s fixed point. If he arrives alive, the loop, the investigation, and Maya’s final choice all require a new explanation.',
    evidence: 'LOCKED FACT · Scene 7, p.3',
    nodes: [
      ['SCENE 7', 'Maya witnesses Jonah die', 'Fixed point'],
      ['SCENE 19', 'Jonah enters alive', 'Revision claim'],
      ['SCENE 28', 'Maya accepts she cannot save him', 'Final choice collapses']
    ]
  }
};

const issuesRoot = document.querySelector('#issues');
const copyRoot = document.querySelector('#impact-copy');
const nodesRoot = document.querySelector('#impact-nodes');
const lines = document.querySelector('#impact-lines');
const response = document.querySelector('#agent-response');
const status = document.querySelector('#analysis-status');
const statusMeta = document.querySelector('#status-meta');
let activeKey = 'code';

function renderIssueList() {
  issuesRoot.innerHTML = Object.entries(issues).map(([key, issue]) => `
    <button class="issue ${key === activeKey ? 'active' : ''}" data-issue="${key}">
      <span class="issue-top"><span class="issue-number">${issue.number}</span><span class="issue-severity">${issue.severity}</span></span>
      <h3>${issue.title}</h3><p>${issue.summary}</p>
    </button>`).join('');
}

function renderImpact(key) {
  activeKey = key;
  const issue = issues[key];
  renderIssueList();
  copyRoot.innerHTML = `<p class="eyebrow">${issue.evidence}</p><h3>${issue.heading}</h3><p>${issue.copy}</p>`;
  const positions = [[44, 190], [42, 300], [59, 83]];
  nodesRoot.innerHTML = issue.nodes.map((node, index) => `<div class="node ${index === 0 ? 'primary' : ''}" style="left:${positions[index][0]}%;top:${positions[index][1]}px"><span class="node-kicker">${node[0]}</span><b>${node[1]}</b><small>${node[2]}</small></div>`).join('');
  lines.innerHTML = '<path d="M 510 248 C 565 248, 585 330, 535 340"/><path d="M 510 248 C 615 220, 640 130, 680 130"/>';
  document.querySelectorAll('[data-issue]').forEach((item) => item.classList.toggle('active', item.dataset.issue === key));
  response.innerHTML = `<span class="response-kicker">${issue.number} / ${issue.severity}</span><p><b>${issue.title}.</b> I found one locked fact in conflict and traced <b>two later beats</b> whose purpose changes. The smallest repair is to revise this scene — not the ending.</p>`;
}

function selectIssue(event) {
  const source = event.target.closest('[data-issue]');
  if (source && issues[source.dataset.issue]) renderImpact(source.dataset.issue);
}

document.addEventListener('click', selectIssue);
document.querySelector('#show-ledger').addEventListener('click', () => document.querySelector('#canon').scrollIntoView({ behavior: 'smooth' }));

document.querySelector('#run-analysis').addEventListener('click', () => {
  const button = document.querySelector('#run-analysis');
  button.disabled = true;
  button.textContent = 'Reading revision…';
  status.textContent = 'Canon agent is extracting people, objects, knowledge, time, and irreversible events.';
  statusMeta.textContent = 'Checking 4 claims against 26 facts';
  setTimeout(() => {
    button.innerHTML = '<span class="spark">✦</span> Analysis complete';
    status.textContent = '4 canon breaks found. Each one is linked to the locked evidence and the later beats it changes.';
    statusMeta.textContent = '4 breaks · 8 downstream beats';
    renderImpact('code');
  }, 1200);
});

renderImpact(activeKey);
