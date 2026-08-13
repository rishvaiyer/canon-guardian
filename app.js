import mammoth from 'mammoth';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorker;

let issues = {
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
const importDialog = document.querySelector('#import-dialog');
const uploadInput = document.querySelector('#script-upload');
const dropZone = document.querySelector('#drop-zone');
const importQueue = document.querySelector('#import-queue');
const useImport = document.querySelector('#use-import');
const projectTitle = document.querySelector('#project-title');
const projectMeta = document.querySelector('#project-meta');
const canonCount = document.querySelector('#canon-count');
const fileCount = document.querySelector('#file-count');
let activeKey = 'code';
let stagedFiles = [];
let storyMemory = null;

const sceneHeadingPattern = /^(?:INT\.?|EXT\.?|INT\/EXT\.?|I\/E\.?)/i;
const speakerPattern = /^[A-Z][A-Z .'-]{1,34}$/;
const ignoredSpeakers = new Set(['INT', 'EXT', 'DAY', 'NIGHT', 'CONTINUOUS', 'CUT TO', 'FADE IN', 'FADE OUT']);

function cleanExcerpt(value, limit = 142) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1).trimEnd()}…` : normalized;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function cleanName(value) {
  return value.replace(/\(.*?\)/g, '').replace(/[^A-Za-z' -]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function sourceRef(line) {
  return `${line.file} · ${line.sceneLabel} · excerpt ${line.lineNumber}`;
}

function lineHasCharacter(line, character) {
  return new RegExp(`\\b${character.split(' ').map((part) => part.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')).join('\\s+')}\\b`, 'i').test(line.text);
}

function isLikelySpeaker(text) {
  const normalized = cleanName(text);
  return normalized.length > 1 && speakerPattern.test(text.trim()) && !ignoredSpeakers.has(normalized);
}

function buildLocalStoryMemory(files) {
  const lines = [];
  const characters = new Set();
  let sourceOrder = 0;

  files.forEach((entry) => {
    let sceneNumber = 0;
    let currentScene = 'Opening pages';
    entry.text.split(/\r?\n/).forEach((rawText, lineNumber) => {
      const text = rawText.trim();
      if (!text) return;
      if (sceneHeadingPattern.test(text)) {
        sceneNumber += 1;
        currentScene = `Scene ${sceneNumber}: ${cleanExcerpt(text, 46)}`;
      }
      if (isLikelySpeaker(text)) characters.add(cleanName(text));
      lines.push({
        text,
        file: entry.file.name,
        lineNumber: lineNumber + 1,
        index: sourceOrder++,
        sceneNumber,
        sceneLabel: currentScene
      });
    });
  });

  const facts = [];
  const addFact = (type, label, line, detail) => facts.push({ type, label, line, detail });
  const names = [...characters];
  const knownNames = names.length ? names : [];

  lines.forEach((line) => {
    const deathMatch = line.text.match(/^\s*([A-Z][A-Z' -]{1,34})\s+(?:DIES|IS DEAD|HAS DIED|WAS KILLED|IS KILLED)\b/i)
      || line.text.match(/\b([A-Z][a-z]+)\s+(?:dies|is dead|has died|was killed|is killed)\b/i);
    if (deathMatch) {
      const character = cleanName(deathMatch[1]);
      if (character.length > 1) addFact('death', `${character} is dead`, line, 'Irreversible event');
    }

    const injuryMatch = line.text.match(/\b(left|right)\s+(wrist|hand|arm|leg|ankle|shoulder)\b[^.]{0,100}\b(fractured|broken|injured|unusable|bandaged|bloodied|bleeding)\b/i);
    if (injuryMatch) addFact('injury', `${injuryMatch[1].toLowerCase()} ${injuryMatch[2].toLowerCase()} is impaired`, line, 'Physical constraint');

    if (/\b(?:burner |cell )?phone\b[^.]{0,100}\b(?:dead|dies|drained|no battery|powers? down)\b/i.test(line.text)) {
      addFact('phone', 'Phone is unusable', line, 'Object state');
    }

    const revealMatch = line.text.match(/\b(?:learns?|discovers?|reveals?|tells?\s+\w+|hears?)\b[^.]{0,80}\b(\d(?:[\d -]*\d){2,})\b/i);
    if (revealMatch) addFact('knowledge', `Code ${revealMatch[1].replace(/\D/g, '')} becomes known`, line, 'Knowledge state');

    const objectMatch = line.text.match(/\b([A-Za-z][A-Za-z -]{1,30})\b[^.]{0,60}\b(?:burns|shatters|breaks|is destroyed|is gone)\b/i);
    if (objectMatch && !/\b(?:he|she|they|it)\b/i.test(objectMatch[1])) {
      addFact('destroyed', `${cleanExcerpt(objectMatch[1], 28)} is destroyed or gone`, line, 'Object state');
    }
  });

  const uniqueFacts = facts.filter((fact, index) => facts.findIndex((candidate) => candidate.type === fact.type && candidate.label === fact.label && candidate.line.file === fact.line.file) === index);
  return { lines, characters: knownNames, facts: uniqueFacts, sourceCount: files.length };
}

function makeImportedIssue(number, severity, title, summary, condition, conflict, type, downstream = []) {
  const downstreamNode = downstream[0];
  const conditionVerb = type === 'death' ? 'A character state' : type === 'knowledge' ? 'A knowledge state' : 'An established state';
  return {
    number: `BREAK ${String(number).padStart(2, '0')}`,
    title,
    severity,
    summary,
    heading: 'This revision conflicts with an earlier source claim.',
    copy: `${conditionVerb} was extracted locally from “${cleanExcerpt(condition.text, 84)}”. The later line says “${cleanExcerpt(conflict.text, 84)}”. Review whether the later beat is intentional (for example, a flashback) or needs a rewrite.`,
    evidence: `SOURCE FACT · ${sourceRef(condition)}`,
    nodes: [
      [condition.sceneLabel, cleanExcerpt(condition.text, 58), sourceRef(condition)],
      [conflict.sceneLabel, cleanExcerpt(conflict.text, 58), `Conflicting claim · ${sourceRef(conflict)}`],
      downstreamNode ? [downstreamNode.sceneLabel, cleanExcerpt(downstreamNode.text, 58), `Later beat to review · ${sourceRef(downstreamNode)}`] : ['NEXT PASS', 'No direct later reference extracted', 'Add more pages for downstream tracing']
    ]
  };
}

function findDownstream(lines, afterIndex, terms) {
  return lines.filter((line) => line.index > afterIndex && terms.some((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i').test(line.text))).slice(0, 1);
}

function analyzeImportedMemory(memory) {
  const found = {};
  let count = 0;
  const add = (issue) => { found[`import-${count}`] = issue; count += 1; };

  memory.facts.filter((fact) => fact.type === 'death').forEach((fact) => {
    const character = fact.label.replace(' is dead', '');
    const later = memory.lines.find((line) => line.index > fact.line.index && lineHasCharacter(line, character)
      && new RegExp(`\\b(?:${character.split(' ').join('\\s+')}\\s+(?:enters|arrives|walks|appears|speaks)|alive)\\b`, 'i').test(line.text));
    if (later) add(makeImportedIssue(count + 1, 'HIGH', `${character} returns after an on-page death`, `${character} is recorded as dead, then later appears active.`, fact.line, later, 'death', findDownstream(memory.lines, later.index, [character])));
  });

  memory.facts.filter((fact) => fact.type === 'phone').forEach((fact) => {
    const later = memory.lines.find((line) => line.index > fact.line.index && /\b(?:phone|burner|cell)\b[^.]{0,100}\b(?:wakes|lights|rings|texts?|calls?|powers? on)\b/i.test(line.text));
    if (later) add(makeImportedIssue(count + 1, 'MEDIUM', 'A disabled phone becomes active', 'A phone is marked unusable, then later performs an active function.', fact.line, later, 'phone', findDownstream(memory.lines, later.index, ['phone', 'burner', 'cell'])));
  });

  memory.facts.filter((fact) => fact.type === 'injury').forEach((fact) => {
    const side = fact.label.split(' ')[0];
    const bodyPart = fact.label.split(' ')[1];
    const later = memory.lines.find((line) => line.index > fact.line.index && new RegExp(`\\b${side}\\s+${bodyPart}\\b[^.]{0,90}\\b(?:types?|texts?|writes?|lifts?|grabs?|holds?)\\b|\\b(?:types?|texts?|writes?|lifts?|grabs?|holds?)\\b[^.]{0,90}\\b${side}\\s+${bodyPart}\\b`, 'i').test(line.text));
    if (later) add(makeImportedIssue(count + 1, 'MEDIUM', `An injured ${side} ${bodyPart} performs a precise action`, `The imported pages establish the ${side} ${bodyPart} as impaired, then use it in a later action.`, fact.line, later, 'injury', findDownstream(memory.lines, later.index, [side, bodyPart])));
  });

  memory.facts.filter((fact) => fact.type === 'knowledge').forEach((fact) => {
    const code = fact.label.match(/\d+/)?.[0];
    if (!code) return;
    const flexibleCode = code.split('').join('[ -]*');
    const usedEarly = memory.lines.find((line) => line.index < fact.line.index && new RegExp(`\\b(?:keys?|types?|enters?)\\b[^.]{0,70}${flexibleCode}`, 'i').test(line.text));
    if (usedEarly) add(makeImportedIssue(count + 1, 'HIGH', `Code ${code} is used before it is learned`, `The code is used earlier than its recorded reveal.`, fact.line, usedEarly, 'knowledge', findDownstream(memory.lines, fact.line.index, [code])));
  });

  return found;
}

function renderImportedFacts(memory) {
  const factRoot = document.querySelector('.fact-list');
  const cards = memory.facts.slice(0, 6);
  if (!cards.length) {
    factRoot.innerHTML = '<p class="empty-queue">No explicit lockable facts were found yet. Add scene headings and concrete actions to improve local checks.</p>';
    return;
  }
  factRoot.innerHTML = cards.map((fact, index) => `<div class="fact"><span class="fact-index">${String(index + 1).padStart(2, '0')}</span><span><b>${escapeHtml(fact.label)}</b><small>${escapeHtml(fact.detail)} · ${escapeHtml(sourceRef(fact.line))}</small></span><span class="fact-arrow">⌁</span></div>`).join('');
}

function renderIssueList() {
  issuesRoot.innerHTML = Object.entries(issues).map(([key, issue]) => `
    <button class="issue ${key === activeKey ? 'active' : ''}" data-issue="${key}">
      <span class="issue-top"><span class="issue-number">${escapeHtml(issue.number)}</span><span class="issue-severity">${escapeHtml(issue.severity)}</span></span>
      <h3>${escapeHtml(issue.title)}</h3><p>${escapeHtml(issue.summary)}</p>
    </button>`).join('');
}

function renderImpact(key) {
  activeKey = key;
  const issue = issues[key];
  renderIssueList();
  copyRoot.innerHTML = `<p class="eyebrow">${escapeHtml(issue.evidence)}</p><h3>${escapeHtml(issue.heading)}</h3><p>${escapeHtml(issue.copy)}</p>`;
  const positions = [[44, 190], [42, 300], [59, 83]];
  nodesRoot.innerHTML = issue.nodes.map((node, index) => `<div class="node ${index === 0 ? 'primary' : ''}" style="left:${positions[index][0]}%;top:${positions[index][1]}px"><span class="node-kicker">${escapeHtml(node[0])}</span><b>${escapeHtml(node[1])}</b><small>${escapeHtml(node[2])}</small></div>`).join('');
  lines.innerHTML = '<path d="M 510 248 C 565 248, 585 330, 535 340"/><path d="M 510 248 C 615 220, 640 130, 680 130"/>';
  document.querySelectorAll('[data-issue]').forEach((item) => item.classList.toggle('active', item.dataset.issue === key));
  response.innerHTML = `<span class="response-kicker">${escapeHtml(issue.number)} / ${escapeHtml(issue.severity)}</span><p><b>${escapeHtml(issue.title)}.</b> I found a source-backed conflict and mapped the next beat to review. The smallest repair is usually to revise this scene before changing the ending.</p>`;
}

function selectIssue(event) {
  const source = event.target.closest('[data-issue]');
  if (source && issues[source.dataset.issue]) renderImpact(source.dataset.issue);
}

document.addEventListener('click', selectIssue);
document.querySelector('#show-ledger').addEventListener('click', () => document.querySelector('#canon').scrollIntoView({ behavior: 'smooth' }));

function renderNoImportedBreaks() {
  issuesRoot.innerHTML = '<p class="empty-queue">No deterministic contradictions found in these sources.</p>';
  copyRoot.innerHTML = '<p class="eyebrow">LOCAL CHECK COMPLETE</p><h3>No hard conflicts surfaced.</h3><p>The imported pages were indexed for explicit deaths, injuries, phone states, and numeric-code reveals. Add another revision or more concrete scene action to deepen the comparison.</p>';
  nodesRoot.innerHTML = '';
  lines.innerHTML = '';
  response.innerHTML = '<span class="response-kicker">LOCAL MEMORY READY</span><p>I found no explicit state reversals in the imported pages. This is a deterministic first-pass check, so editor review remains the source of truth.</p>';
}

document.querySelector('#run-analysis').addEventListener('click', () => {
  const button = document.querySelector('#run-analysis');
  button.disabled = true;
  button.textContent = 'Reading revision…';
  status.textContent = 'Story agent is extracting people, objects, knowledge, time, and irreversible events.';
  statusMeta.textContent = storyMemory ? `Checking local sources against ${storyMemory.facts.length} extracted facts` : 'Checking 4 claims against 26 facts';
  setTimeout(() => {
    button.innerHTML = '<span class="spark">✦</span> Analysis complete';
    button.disabled = false;
    if (!storyMemory) {
      status.textContent = '4 canon breaks found. Each one is linked to the locked evidence and the later beats it changes.';
      statusMeta.textContent = '4 breaks · 8 downstream beats';
      renderImpact('code');
      return;
    }
    issues = analyzeImportedMemory(storyMemory);
    const importedKeys = Object.keys(issues);
    if (!importedKeys.length) {
      status.textContent = 'No deterministic canon breaks found. The local ledger is ready for the next revision.';
      statusMeta.textContent = `${storyMemory.facts.length} extracted facts · local-only`;
      renderNoImportedBreaks();
      return;
    }
    activeKey = importedKeys[0];
    status.textContent = `${importedKeys.length} source-backed ${importedKeys.length === 1 ? 'break' : 'breaks'} found. Each alert includes the exact earlier and later claims.`;
    statusMeta.textContent = `${importedKeys.length} breaks · ${storyMemory.facts.length} extracted facts · local-only`;
    renderImpact(activeKey);
  }, storyMemory ? 450 : 1200);
});

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function documentKind(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  return extension === 'fountain' ? 'FOUNTAIN' : extension === 'fdx' ? 'FINAL DRAFT' : extension.toUpperCase();
}

function renderImportQueue() {
  if (!stagedFiles.length) {
    importQueue.innerHTML = '<p class="empty-queue">No pages in this import yet.</p>';
    useImport.disabled = true;
    return;
  }
  useImport.disabled = false;
  importQueue.innerHTML = stagedFiles.map(({ file }, index) => `
    <div class="queued-file"><span class="file-type">${escapeHtml(documentKind(file))}</span><span class="file-detail"><span class="file-name">${escapeHtml(file.name)}</span><span class="file-status">${formatSize(file.size)} · ready for local extraction</span></span><button class="remove-file" data-remove-file="${index}" aria-label="Remove ${escapeHtml(file.name)}">×</button></div>`).join('');
}

function addFiles(files) {
  const allowable = Array.from(files).filter((file) => /\.(txt|fountain|fdx|pdf|docx)$/i.test(file.name));
  const newFiles = allowable.filter((file) => !stagedFiles.some(({ file: staged }) => staged.name === file.name && staged.size === file.size));
  stagedFiles = [...stagedFiles, ...newFiles.map((file) => ({ file }))];
  renderImportQueue();
}

function countScenes(text) {
  return (text.match(/(?:^|\n)\s*(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.)/gim) || []).length;
}

async function extractPdf(file, onProgress) {
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress(`Reading ${file.name}: page ${pageNumber} of ${pdf.numPages}`);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageLines = [];
    let activeLine = [];
    let previousY = null;
    content.items.forEach((item) => {
      const y = item.transform?.[5];
      if (previousY !== null && Number.isFinite(y) && Math.abs(y - previousY) > 2.5 && activeLine.length) {
        pageLines.push(activeLine.join(' '));
        activeLine = [];
      }
      if (item.str) activeLine.push(item.str);
      if (Number.isFinite(y)) previousY = y;
    });
    if (activeLine.length) pageLines.push(activeLine.join(' '));
    pages.push(pageLines.join('\n'));
  }
  return { text: pages.join('\n'), pages: pdf.numPages };
}

async function extractFdx(file) {
  const xml = new DOMParser().parseFromString(await file.text(), 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('The Final Draft file could not be read.');
  const paragraphs = [...xml.querySelectorAll('Paragraph')];
  return {
    text: paragraphs.map((paragraph) => paragraph.textContent.trim()).filter(Boolean).join('\n'),
    scenes: paragraphs.filter((paragraph) => /scene heading/i.test(paragraph.getAttribute('Type') || '')).length
  };
}

async function extractFile(file, onProgress) {
  const extension = file.name.split('.').pop().toLowerCase();
  if (extension === 'pdf') {
    const pdf = await extractPdf(file, onProgress);
    return { ...pdf, scenes: countScenes(pdf.text) };
  }
  if (extension === 'docx') {
    onProgress(`Reading ${file.name}`);
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { text: result.value, scenes: countScenes(result.value), pages: 0 };
  }
  if (extension === 'fdx') {
    const fdx = await extractFdx(file);
    return { ...fdx, pages: 0 };
  }
  const text = await file.text();
  return { text, scenes: countScenes(text), pages: 0 };
}

async function buildStoryMemory() {
  useImport.disabled = true;
  useImport.textContent = 'Reading documents…';
  const extracted = [];
  try {
    for (const entry of stagedFiles) {
      const result = await extractFile(entry.file, (message) => { status.textContent = message; });
      extracted.push({ ...entry, ...result });
    }
    const totalScenes = extracted.reduce((total, file) => total + file.scenes, 0);
    const totalPages = extracted.reduce((total, file) => total + file.pages, 0);
    const primaryFile = extracted[0].file;
    storyMemory = buildLocalStoryMemory(extracted);
    projectTitle.textContent = primaryFile.name.replace(/\.[^.]+$/, '');
    projectMeta.textContent = `${extracted.length} source ${extracted.length === 1 ? 'file' : 'files'} · ${totalScenes || totalPages || 'story'} ${totalScenes === 1 ? 'scene' : totalScenes ? 'scenes' : totalPages === 1 ? 'page' : totalPages ? 'pages' : 'indexed'}`;
    canonCount.textContent = `${storyMemory.facts.length} extracted facts`;
    fileCount.textContent = `${extracted.length} source ${extracted.length === 1 ? 'file' : 'files'}`;
    status.textContent = `${storyMemory.facts.length} explicit story facts were indexed locally from ${extracted.length} ${extracted.length === 1 ? 'source' : 'sources'}. Run the check to compare their states.`;
    statusMeta.textContent = `${totalScenes || totalPages || storyMemory.lines.length} scenes or lines ready · local-only`;
    stagedFiles = extracted;
    renderImportedFacts(storyMemory);
    renderImportQueue();
    importDialog.close();
  } catch (error) {
    status.textContent = `Could not read the selected file: ${error.message}`;
    statusMeta.textContent = 'Nothing was uploaded or sent';
  } finally {
    useImport.textContent = 'Build story memory';
    useImport.disabled = !stagedFiles.length;
  }
}

document.querySelector('#open-upload').addEventListener('click', () => importDialog.showModal());
document.querySelector('#close-upload').addEventListener('click', () => importDialog.close());
uploadInput.addEventListener('change', (event) => addFiles(event.target.files));
useImport.addEventListener('click', buildStoryMemory);
importQueue.addEventListener('click', (event) => {
  const remove = event.target.closest('[data-remove-file]');
  if (!remove) return;
  stagedFiles.splice(Number(remove.dataset.removeFile), 1);
  renderImportQueue();
});
['dragenter', 'dragover'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  dropZone.classList.add('dragging');
}));
['dragleave', 'drop'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragging');
}));
dropZone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));

renderImpact(activeKey);
