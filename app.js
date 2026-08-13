import mammoth from 'mammoth';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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
const importError = document.querySelector('#import-error');
const importRole = document.querySelector('#import-role');
const cloudDialog = document.querySelector('#cloud-dialog');
const cloudConsent = document.querySelector('#cloud-consent');
const cloudError = document.querySelector('#cloud-error');
const cloudReviewButton = document.querySelector('#run-cloud-review');
const manualFactDialog = document.querySelector('#manual-fact-dialog');
const manualFactForm = document.querySelector('#manual-fact-form');
const manualFactError = document.querySelector('#manual-fact-error');
const useImport = document.querySelector('#use-import');
const projectTitle = document.querySelector('#project-title');
const projectMeta = document.querySelector('#project-meta');
const canonCount = document.querySelector('#canon-count');
const fileCount = document.querySelector('#file-count');
const privacyNote = document.querySelector('#privacy-note');
const seriesLibrary = document.querySelector('#series-library');
const clearProject = document.querySelector('#clear-project');
const storyGraphNodes = document.querySelector('#story-graph-nodes');
const storyGraphLines = document.querySelector('#story-graph-lines');
const storyGraphDetail = document.querySelector('#story-graph-detail');
const storyGraphNote = document.querySelector('#story-graph-note');
const sceneIndexList = document.querySelector('#scene-index-list');
const sceneIndexCount = document.querySelector('#scene-index-count');
const characterFilters = document.querySelector('#character-filters');
const characterInspector = document.querySelector('#character-inspector');
const atlasModes = document.querySelector('#atlas-modes');
const atlasExpand = document.querySelector('#atlas-expand');
const aiReadiness = document.querySelector('#ai-readiness');
const aiNextStep = document.querySelector('#ai-next-step');
const workflowRail = document.querySelector('#workflow-rail');
const canonAiDialog = document.querySelector('#canon-ai-dialog');
const canonAiConsent = document.querySelector('#canon-ai-consent');
const canonAiReadiness = document.querySelector('#canon-ai-readiness');
const canonAiNextStep = document.querySelector('#canon-ai-next-step');
const canonAiError = document.querySelector('#canon-ai-error');
const canonAiButton = document.querySelector('#run-canon-ai');
const downloadAnnotated = document.querySelector('#download-annotated');
let activeKey = 'code';
let activeGraphNode = 0;
let activeCharacter = 'ALL';
let activeAtlasMode = 'all';
let showFullMap = false;
let stagedFiles = [];
let storyMemory = null;
let currentImportRole = 'canon';
let cloudConfigured = null;
let sourcePdfFile = null;
let sourcePdfPageLineCounts = [];
let currentAnnotations = [];
const projectStorageKey = 'story-is-straight-project-v3';
let projectLedger = { title: '', sources: [], facts: [] };

const sceneHeadingPattern = /^(?:INT\.?|EXT\.?|INT\/EXT\.?|I\/E\.?)(?![A-Za-z])/i;
const speakerPattern = /^[A-Z][A-Z .'-]{1,34}$/;
const ignoredSpeakers = new Set(['INT', 'EXT', 'DAY', 'NIGHT', 'CONTINUOUS', 'CUT TO', 'FADE IN', 'FADE OUT', 'BLACK', 'NARRATOR', 'TITLE', 'MONTAGE', 'VOICE', 'VOICE OVER', 'V O', 'O S', 'ALL', 'GIRL', 'BOY', 'MAN', 'WOMAN', 'HE', 'SHE', 'THEY', 'FAMILY']);
const ignoredSpeakerWords = new Set(['INT', 'EXT', 'DAY', 'NIGHT', 'CU', 'CLOSE', 'ON', 'ANGLE', 'BOTH', 'TV', 'DUDES', 'ANOTHER', 'CO', 'WORKER', 'THE', 'A', 'AN', 'ASLEEP']);

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

function factId(fact) {
  return `${fact.type}|${fact.label}|${fact.line.file}|${fact.line.lineNumber}`;
}

function storedFact(fact) {
  return { id: factId(fact), type: fact.type, label: fact.label, detail: fact.detail, line: { ...fact.line }, origin: fact.origin || 'local', locked: false };
}

function readProjectLedger() {
  try {
    const stored = JSON.parse(localStorage.getItem(projectStorageKey) || 'null');
    if (stored?.sources && stored?.facts) projectLedger = stored;
  } catch {
    projectLedger = { title: '', sources: [], facts: [] };
  }
}

function saveProjectLedger() {
  try { localStorage.setItem(projectStorageKey, JSON.stringify(projectLedger)); } catch { /* Browser storage can be unavailable or full. */ }
}

function mergeFactsIntoLedger(facts) {
  facts.forEach((fact) => {
    const candidate = storedFact(fact);
    if (!projectLedger.facts.some((saved) => saved.id === candidate.id)) projectLedger.facts.push(candidate);
  });
}

function visibleLedgerFacts() {
  const all = [...projectLedger.facts];
  (storyMemory?.facts || []).forEach((fact) => {
    const candidate = storedFact(fact);
    if (!all.some((saved) => saved.id === candidate.id)) all.push(candidate);
  });
  return all;
}

function renderSeriesLibrary() {
  const locked = projectLedger.facts.filter((fact) => fact.locked).length;
  if (!projectLedger.sources.length) {
    seriesLibrary.innerHTML = '';
    clearProject.hidden = true;
    return;
  }
  clearProject.hidden = false;
  seriesLibrary.innerHTML = `<div><b>${projectLedger.sources.length} ${projectLedger.sources.length === 1 ? 'source' : 'sources'} · ${locked} locked</b></div>${projectLedger.sources.slice(-3).reverse().map((source) => `<div class="series-source"><span>${escapeHtml(source.name)}</span><b>${source.role === 'revision' ? 'REVISION' : 'CANON'}</b></div>`).join('')}`;
}

function renderLedgerFacts() {
  const factRoot = document.querySelector('.fact-list');
  const cards = visibleLedgerFacts().sort((left, right) => Number(right.locked) - Number(left.locked) || Number(right.origin === 'ai') - Number(left.origin === 'ai')).slice(0, 20);
  if (!cards.length) {
    factRoot.innerHTML = '<p class="empty-queue">No high-confidence automatic locks were found. That is normal for relationship- and character-driven scripts.</p><button class="text-button add-manual-fact" data-open-manual-fact>+ Lock an important story fact yourself</button>';
    return;
  }
  factRoot.innerHTML = cards.map((fact, index) => `<button class="fact" data-lock-fact="${escapeHtml(fact.id)}"><span class="fact-index">${String(index + 1).padStart(2, '0')}</span><span><b>${escapeHtml(fact.label)}</b><small>${escapeHtml(fact.detail)} · ${escapeHtml(sourceRef(fact.line))}</small></span><span class="fact-state ${fact.locked ? 'locked' : ''}">${fact.locked ? 'LOCKED' : fact.origin === 'ai' ? 'REVIEW' : 'LOCK'}</span></button>`).join('');
}

function renderWorkflow() {
  const canonSources = projectLedger.sources.filter((source) => source.role === 'canon').length;
  const candidates = projectLedger.facts.filter((fact) => fact.origin === 'ai' && !fact.locked).length;
  const locks = projectLedger.facts.filter((fact) => fact.locked).length;
  const revisions = projectLedger.sources.filter((source) => source.role === 'revision').length;
  const canonOpenNow = Boolean(storyMemory && currentImportRole === 'canon');
  const steps = [
    { number: '01', title: 'Add canon', detail: canonSources ? `${canonSources} source${canonSources === 1 ? '' : 's'} indexed` : 'Start with the trusted draft', done: Boolean(canonSources), action: 'canon', cta: canonSources ? 'Re-open canon' : 'Add canon' },
    { number: '02', title: 'Generate candidates', detail: candidates ? `${candidates} facts ready for review` : canonSources && !canonOpenNow ? 'Re-open canon pages for AI' : 'Ask AI to find story rules', done: candidates > 0 || locks > 0, action: 'candidates', cta: canonSources && !canonOpenNow ? 'Re-open canon' : 'Generate' },
    { number: '03', title: 'Approve canon', detail: locks ? `${locks} fact${locks === 1 ? '' : 's'} locked` : 'Keep only what must stay true', done: locks > 0, action: 'lock', cta: 'Lock fact' },
    { number: '04', title: 'Compare revision', detail: revisions ? `${revisions} revision${revisions === 1 ? '' : 's'} indexed` : 'Bring in the changed pages', done: revisions > 0, action: 'revision', cta: 'Add revision' }
  ];
  workflowRail.innerHTML = steps.map((step) => `<div class="workflow-step ${step.done ? 'done' : ''}"><span>${step.number}</span><div><b>${step.title}</b><small>${step.detail}</small></div><button class="text-button" data-workflow-action="${step.action}" type="button">${step.done && step.action !== 'canon' ? 'View' : step.cta} ↗</button></div>`).join('');
}

function refreshSavedProject() {
  const locked = projectLedger.facts.filter((fact) => fact.locked).length;
  if (projectLedger.sources.length) {
    const firstCanon = projectLedger.sources.find((source) => source.role === 'canon') || projectLedger.sources[0];
    projectTitle.textContent = projectLedger.title || firstCanon.name.replace(/\.[^.]+$/, '');
    projectMeta.textContent = `${projectLedger.sources.length} saved ${projectLedger.sources.length === 1 ? 'source' : 'sources'} · browser-local`;
    canonCount.textContent = `${locked} locked facts`;
    fileCount.textContent = `${projectLedger.sources.length} series ${projectLedger.sources.length === 1 ? 'source' : 'sources'}`;
    updatePrivacyNote(projectLedger.sources.length);
  }
  renderSeriesLibrary();
  renderLedgerFacts();
  renderWorkflow();
}

function lineHasCharacter(line, character) {
  return new RegExp(`\\b${character.split(' ').map((part) => part.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')).join('\\s+')}\\b`, 'i').test(line.text);
}

function isLikelySpeaker(text) {
  const normalized = cleanName(text);
  const words = normalized.split(' ');
  return normalized.length > 1 && speakerPattern.test(text.trim()) && !sceneHeadingPattern.test(text) && !ignoredSpeakers.has(normalized) && !words.some((word) => ignoredSpeakerWords.has(word));
}

function isKnownCharacter(value, knownCharacters) {
  const character = cleanName(value);
  return character.length > 1 && knownCharacters.has(character) && !ignoredSpeakers.has(character);
}

function buildLocalStoryMemory(files) {
  const lines = [];
  const characters = new Set();
  let sourceOrder = 0;

  files.forEach((entry) => {
    let sceneNumber = 0;
    let currentScene = '';
    const pageLineCounts = entry.pageLineCounts || [];
    entry.text.split(/\r?\n/).forEach((rawText, lineNumber) => {
      const text = rawText.trim();
      if (!text) return;
      if (sceneHeadingPattern.test(text)) {
        sceneNumber += 1;
        currentScene = `Scene ${sceneNumber}: ${cleanExcerpt(text, 46)}`;
      }
      if (sceneNumber && isLikelySpeaker(text)) characters.add(cleanName(text));
      let pageNumber = 0;
      let pageY = 0;
      if (pageLineCounts.length) {
        let consumed = 0;
        const pageIndex = pageLineCounts.findIndex((count) => {
          consumed += count;
          return lineNumber < consumed;
        });
        pageNumber = pageIndex + 1;
        pageY = entry.pageLineYPositions?.[pageIndex]?.[lineNumber - (consumed - pageLineCounts[pageIndex])];
      }
      lines.push({
        text,
        file: entry.file.name,
        lineNumber: lineNumber + 1,
        pageNumber,
        pageY,
        index: sourceOrder++,
        sceneNumber,
        sceneLabel: currentScene || 'Front matter'
      });
    });
  });

  const facts = [];
  const addFact = (type, label, line, detail) => facts.push({ type, label, line, detail });
  const names = [...characters];
  const knownNames = names.length ? names : [];
  const knownCharacterSet = new Set(knownNames);

  lines.forEach((line) => {
    const deathMatch = line.text.match(/^\s*([A-Z][A-Z' -]{1,34})\s+(?:DIES|IS DEAD|HAS DIED|WAS KILLED|IS KILLED)\b/)
      || line.text.match(/\b([A-Z][a-z]+)\s+(?:dies|is dead|has died|was killed|is killed)\b/i);
    if (deathMatch && isKnownCharacter(deathMatch[1], knownCharacterSet)) {
      const character = cleanName(deathMatch[1]);
      addFact('death', `${character} is dead`, line, 'High-confidence irreversible event');
    }

    const injuryMatch = line.text.match(/\b(left|right)\s+(wrist|hand|arm|leg|ankle|shoulder)\b[^.]{0,100}\b(fractured|broken|injured|unusable|bandaged|bloodied|bleeding)\b/i);
    if (injuryMatch) addFact('injury', `${injuryMatch[1].toLowerCase()} ${injuryMatch[2].toLowerCase()} is impaired`, line, 'Physical constraint');

    if (/\b(?:burner |cell )?phone\b[^.]{0,100}\b(?:dead|dies|drained|no battery|powers? down)\b/i.test(line.text)) {
      addFact('phone', 'Phone is unusable', line, 'Object state');
    }

    const revealMatch = line.text.match(/\b(?:learns?|discovers?|reveals?|tells?\s+\w+|hears?)\b[^.]{0,80}\b(\d(?:[\d -]*\d){2,})\b/i);
    if (revealMatch) addFact('knowledge', `Code ${revealMatch[1].replace(/\D/g, '')} becomes known`, line, 'Knowledge state');

  });

  const uniqueFacts = facts.filter((fact, index) => facts.findIndex((candidate) => candidate.type === fact.type && candidate.label === fact.label && candidate.line.file === fact.line.file) === index);
  const sceneCount = new Set(lines.filter((line) => line.sceneNumber).map((line) => line.sceneLabel)).size;
  return { lines, characters: knownNames, facts: uniqueFacts, sourceCount: files.length, sceneCount };
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
    ],
    annotationLines: [
      { ...condition, annotationRole: 'Earlier canon' },
      { ...conflict, annotationRole: 'Conflicting revision' },
      ...(downstreamNode ? [{ ...downstreamNode, annotationRole: 'Downstream beat' }] : [])
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

  const inferredKnowledgeFacts = memory.lines.flatMap((line) => {
    const reveal = line.text.match(/\b(?:learns?|discovers?|reveals?)\b[^.]{0,80}\b(\d(?:[\d -]*\d){2,})\b/i);
    return reveal ? [{ type: 'knowledge', label: `Code ${reveal[1].replace(/\D/g, '')} becomes known`, detail: 'Knowledge state', line }] : [];
  });
  const knowledgeFacts = [...memory.facts.filter((fact) => fact.type === 'knowledge'), ...projectLedger.facts.filter((fact) => fact.locked && fact.type === 'knowledge'), ...inferredKnowledgeFacts]
    .filter((fact, index, all) => all.findIndex((candidate) => factId(candidate) === factId(fact)) === index);
  knowledgeFacts.forEach((fact) => {
    const code = fact.label.match(/\d+/)?.[0];
    if (!code) return;
    const flexibleCode = code.split('').join('[ -]*');
    const revisionLines = memory.lines.filter((line) => line.origin === 'revision');
    const revisionReveal = revisionLines.find((line) => new RegExp(`\\b(?:learns?|discovers?|reveals?)\\b[^.]{0,80}${flexibleCode}`, 'i').test(line.text));
    const usedEarly = revisionLines.find((line) => new RegExp(flexibleCode, 'i').test(line.text) && (Boolean(revisionReveal && line.index < revisionReveal.index) || /\\b(?:before|already|all night|earlier|prior)\\b/i.test(line.text)))
      || memory.lines.find((line) => new RegExp(flexibleCode, 'i').test(line.text) && /\\b(?:before|already|all night|earlier|prior)\\b/i.test(line.text));
    if (usedEarly) add(makeImportedIssue(count + 1, 'HIGH', `Code ${code} is used before it is learned`, `The code is used earlier than its recorded reveal.`, fact.line, usedEarly, 'knowledge', findDownstream(memory.lines, fact.line.index, [code])));
  });

  return found;
}

function renderImportedFacts(memory) {
  if (memory) renderLedgerFacts();
}

function deriveStoryGraph(memory) {
  if (!memory && projectLedger.facts.length) {
    const savedScenes = new Map();
    projectLedger.facts.forEach((fact) => {
      const key = `${fact.line.file}|${fact.line.sceneLabel}`;
      if (!savedScenes.has(key)) savedScenes.set(key, { label: fact.line.sceneLabel.split(':')[0], title: fact.label, characters: [], excerpt: cleanExcerpt(fact.line.text, 132) });
      const character = fact.label.match(/^([A-Z][A-Z' -]{1,34})\s+is\b/)?.[1];
      if (character && !savedScenes.get(key).characters.includes(character)) savedScenes.get(key).characters.push(character);
    });
    return [...savedScenes.values()];
  }
  if (!memory) return [
    { label: 'Scene 7', title: 'Jonah dies', characters: ['MAYA', 'JONAH'], excerpt: 'The fixed point of the loop.' },
    { label: 'Scene 11', title: 'Maya fractures her wrist', characters: ['MAYA'], excerpt: 'A physical constraint is established.' },
    { label: 'Scene 14', title: 'The phone dies', characters: ['MAYA', 'JONAH'], excerpt: 'The last signal becomes a clue.' },
    { label: 'Scene 19', title: 'The Locker', characters: ['MAYA', 'JONAH'], excerpt: 'The incoming revision under review.' },
    { label: 'Scene 23', title: 'Voice memo reveal', characters: ['MAYA'], excerpt: 'The locker code is finally learned.' },
    { label: 'Scene 28', title: 'Final choice', characters: ['MAYA', 'JONAH'], excerpt: 'Maya accepts she cannot save him.' }
  ];
  const graphCharacters = new Set(memory.characters);
  memory.facts.forEach((fact) => {
    const name = fact.label.match(/^([A-Z][A-Z' -]{1,34})\s+is dead$/i)?.[1];
    if (name) graphCharacters.add(cleanName(name));
  });
  const buckets = new Map();
  const graphLines = memory.sceneCount ? memory.lines.filter((line) => line.sceneNumber) : memory.lines;
  graphLines.forEach((line) => {
    const key = line.sceneNumber ? line.sceneLabel : `Beat ${Math.floor((line.lineNumber - 1) / 12) + 1}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(line);
  });
  return [...buckets.entries()].map(([label, lines], index) => {
    const text = lines.map((line) => line.text).join(' ');
    const characters = [...graphCharacters].filter((character) => lineHasCharacter({ text }, character)).slice(0, 3);
    return {
      label: label.startsWith('Scene ') ? label.split(':')[0] : label,
      title: cleanExcerpt(lines[0].text, 42),
      characters,
      excerpt: cleanExcerpt(text, 132),
      index
    };
  });
}

function graphSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0) / 4294967295;
}

function buildGraphEdges(nodes) {
  const order = nodes.slice(1).map((_, index) => [index, index + 1]);
  const character = [];
  const latestAppearance = new Map();
  nodes.forEach((node, index) => node.characters.forEach((name) => {
    if (latestAppearance.has(name)) character.push([latestAppearance.get(name), index]);
    latestAppearance.set(name, index);
  }));
  return { order, character };
}

function makeGraphLayout(nodes, edges) {
  if (nodes.length === 1) return [[50, 48]];
  const positions = nodes.map((node, index) => [
    16 + (graphSeed(`${node.label}-${index}`) * 66),
    14 + (graphSeed(`${node.title}-${index}`) * 68)
  ]);
  const links = [...edges.order.map((edge) => [...edge, 26]), ...edges.character.map((edge) => [...edge, 31])];
  for (let pass = 0; pass < 220; pass += 1) {
    const forces = positions.map(() => [0, 0]);
    positions.forEach((position, index) => positions.slice(index + 1).forEach((other, offset) => {
      const target = index + offset + 1;
      const dx = position[0] - other[0];
      const dy = position[1] - other[1];
      const distance = Math.max(3, Math.hypot(dx, dy));
      const strength = 180 / (distance * distance);
      const x = (dx / distance) * strength;
      const y = (dy / distance) * strength;
      forces[index][0] += x; forces[index][1] += y;
      forces[target][0] -= x; forces[target][1] -= y;
    }));
    links.forEach(([from, to, preferredDistance]) => {
      const dx = positions[to][0] - positions[from][0];
      const dy = positions[to][1] - positions[from][1];
      const distance = Math.max(3, Math.hypot(dx, dy));
      const strength = (distance - preferredDistance) * 0.024;
      const x = (dx / distance) * strength;
      const y = (dy / distance) * strength;
      forces[from][0] += x; forces[from][1] += y;
      forces[to][0] -= x; forces[to][1] -= y;
    });
    positions.forEach((position, index) => {
      forces[index][0] += (50 - position[0]) * 0.008;
      forces[index][1] += (48 - position[1]) * 0.008;
      position[0] = Math.min(87, Math.max(13, position[0] + (forces[index][0] * 0.72)));
      position[1] = Math.min(85, Math.max(15, position[1] + (forces[index][1] * 0.72)));
    });
  }
  return positions;
}

function renderCharacterLens(allNodes) {
  const appearances = new Map();
  allNodes.forEach((node) => node.characters.forEach((character) => appearances.set(character, (appearances.get(character) || 0) + 1)));
  const characters = [...appearances.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!characters.some(([character]) => character === activeCharacter)) activeCharacter = 'ALL';
  characterFilters.innerHTML = [`<button class="character-filter ${activeCharacter === 'ALL' ? 'active' : ''}" data-character-filter="ALL">All <span>${allNodes.length}</span></button>`, ...characters.map(([character, count]) => `<button class="character-filter ${activeCharacter === character ? 'active' : ''}" data-character-filter="${escapeHtml(character)}">${escapeHtml(character)} <span>${count}</span></button>`)].join('');
  if (activeCharacter === 'ALL') {
    const mostPresent = characters.slice(0, 3).map(([character, count]) => `${character} · ${count}`).join(' / ');
    characterInspector.innerHTML = `<strong>Story ensemble</strong><span>${characters.length} named threads · ${allNodes.length} mapped scenes</span><small>${mostPresent ? `Most present: ${mostPresent}` : 'Choose a character to open their dossier.'}</small>`;
    return;
  }
  const characterScenes = allNodes.filter((node) => node.characters.includes(activeCharacter));
  const characterFacts = visibleLedgerFacts().filter((fact) => new RegExp(`\\b${activeCharacter.split(' ').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}\\b`, 'i').test(`${fact.label} ${fact.detail} ${fact.line.text}`));
  const coCharacters = new Map();
  characterScenes.forEach((scene) => scene.characters.filter((name) => name !== activeCharacter).forEach((name) => coCharacters.set(name, (coCharacters.get(name) || 0) + 1)));
  const closest = [...coCharacters.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => `${name} · ${count}`).join(' / ');
  const firstScene = characterScenes[0]?.label || '—';
  const lastScene = characterScenes.at(-1)?.label || '—';
  const locked = characterFacts.filter((fact) => fact.locked).length;
  characterInspector.innerHTML = `<strong>${escapeHtml(activeCharacter)}</strong><span>${characterScenes.length} scenes · ${locked} locked canon · ${characterFacts.length - locked} candidates</span><small>Arc: ${escapeHtml(firstScene)} → ${escapeHtml(lastScene)}${closest ? ` · with ${escapeHtml(closest)}` : ''}</small>`;
}

function nodeHasEvidence(node) {
  if (!storyMemory && !projectLedger.facts.length) return true;
  return visibleLedgerFacts().some((fact) => fact.line.sceneLabel === node.label || fact.line.sceneLabel.startsWith(`${node.label}:`));
}

function nodeIsOnBreakPath(node) {
  const normalized = node.label.toLowerCase();
  return Object.values(issues).some((issue) => (issue.nodes || []).some((item) => String(item[0] || '').toLowerCase() === normalized));
}

function filterAtlasNodes(allNodes) {
  if (activeAtlasMode === 'evidence') return allNodes.filter(nodeHasEvidence);
  if (activeAtlasMode === 'breaks') return allNodes.filter(nodeIsOnBreakPath);
  return allNodes;
}

function renderAtlasModes(allNodes, candidateCount) {
  atlasModes.querySelectorAll('[data-atlas-mode]').forEach((button) => button.classList.toggle('active', button.dataset.atlasMode === activeAtlasMode));
  atlasExpand.hidden = candidateCount <= 36;
  atlasExpand.textContent = showFullMap ? 'Use readable map ↙' : `Show all ${candidateCount || allNodes.length} scenes ↗`;
}

function renderSceneIndex(nodes) {
  sceneIndexCount.textContent = `${nodes.length} ${nodes.length === 1 ? 'scene' : 'scenes'}`;
  if (!nodes.length) {
    sceneIndexList.innerHTML = '<p class="empty-queue">No scenes match this filter.</p>';
    return;
  }
  sceneIndexList.innerHTML = nodes.map((node, index) => {
    const evidence = nodeHasEvidence(node);
    const selected = index === activeGraphNode;
    return `<button class="scene-index-row ${selected ? 'active' : ''}" data-atlas-scene="${index}" type="button"><span class="scene-index-number">${String(index + 1).padStart(2, '0')}</span><span class="scene-index-copy"><b>${escapeHtml(node.label)}</b><strong>${escapeHtml(node.title)}</strong><small>${escapeHtml(node.characters.length ? node.characters.join(' · ') : 'No named thread')}${evidence ? ' · evidence' : ''}</small></span><span class="scene-index-arrow">↗</span></button>`;
  }).join('');
}

function renderStoryGraph(memory) {
  const allNodes = deriveStoryGraph(memory);
  renderCharacterLens(allNodes);
  const atlasNodes = filterAtlasNodes(allNodes);
  const candidateNodes = activeCharacter === 'ALL' ? atlasNodes : atlasNodes.filter((node) => node.characters.includes(activeCharacter));
  const nodes = showFullMap ? candidateNodes : candidateNodes.slice(0, 36);
  renderAtlasModes(allNodes, candidateNodes.length);
  activeGraphNode = Math.min(activeGraphNode, Math.max(0, candidateNodes.length - 1));
  renderSceneIndex(candidateNodes);
  const savedLedgerGraph = !memory && projectLedger.facts.length > 0;
  if (!nodes.length) {
    storyGraphLines.innerHTML = '';
    storyGraphNodes.innerHTML = '';
    const filterName = activeAtlasMode === 'evidence' ? 'evidence-bearing' : activeAtlasMode === 'breaks' ? 'break-path' : 'mapped';
    storyGraphDetail.innerHTML = `<p class="eyebrow">STORY ATLAS</p><h3>No ${filterName} scenes yet.</h3><p>${activeCharacter === 'ALL' ? 'Try All scenes or import more pages.' : `Try All characters or add pages where ${escapeHtml(activeCharacter)} appears by name.`}</p>`;
    storyGraphNote.textContent = `No ${filterName} scenes are available for this view.`;
    return;
  }
  const edges = buildGraphEdges(nodes);
  const positions = makeGraphLayout(nodes, edges);
  const graphNodeIndex = Math.min(activeGraphNode, Math.max(0, nodes.length - 1));
  const toPoint = ([x, y]) => [x * 10, y * 5.6];
  const edgeLines = edges.order.map(([from, to]) => {
    const [x1, y1] = toPoint(positions[from]);
    const [x2, y2] = toPoint(positions[to]);
    return `<line class="graph-edge order" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
  });
  const threadLines = edges.character.map(([from, to]) => {
    const [x1, y1] = toPoint(positions[from]);
    const [x2, y2] = toPoint(positions[to]);
    return `<line class="graph-edge character" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
  });
  storyGraphLines.innerHTML = `${edgeLines.join('')}${threadLines.join('')}`;
  storyGraphNodes.innerHTML = nodes.map((node, index) => `<button class="story-node ${index === graphNodeIndex ? 'active' : ''}" data-graph-node="${index}" style="left:${positions[index][0]}%;top:${positions[index][1]}%"><span>${escapeHtml(node.label)}</span><b>${escapeHtml(node.title)}</b>${node.characters.length ? `<small>${escapeHtml(node.characters.join(' · '))}</small>` : ''}</button>`).join('');
  const selected = nodes[graphNodeIndex];
  const sceneFacts = (storyMemory?.facts || []).filter((fact) => fact.line.sceneLabel === selected.label || fact.line.sceneLabel.startsWith(`${selected.label}:`));
  storyGraphDetail.innerHTML = `<p class="eyebrow">${escapeHtml(selected.label)} / ${memory ? 'IMPORTED SOURCE' : savedLedgerGraph ? 'SAVED CANON' : 'SAMPLE PROJECT'}</p><h3>${escapeHtml(selected.title)}</h3><p>${escapeHtml(selected.excerpt)}</p><span>${selected.characters.length ? `${escapeHtml(selected.characters.join(' · '))} thread` : 'No named character thread extracted'}</span>${sceneFacts.length ? `<button class="text-button graph-lock" data-lock-scene="${escapeHtml(selected.label)}">Lock ${sceneFacts.length} fact${sceneFacts.length === 1 ? '' : 's'} from this scene</button>` : ''}`;
  storyGraphNote.textContent = memory
    ? `${activeCharacter === 'ALL' ? '' : `${activeCharacter} · `}${nodes.length}${candidateNodes.length > nodes.length ? ` of ${candidateNodes.length}` : ''}${memory.sceneCount > allNodes.length && activeCharacter === 'ALL' ? ` of ${memory.sceneCount}` : ''} ${nodes.length === 1 ? 'scene or beat' : 'scenes or beats'} shown${activeAtlasMode !== 'all' ? ` · ${activeAtlasMode === 'evidence' ? 'evidence only' : 'break paths only'}` : ''}. Click a node to inspect its local thread.`
    : savedLedgerGraph ? `${nodes.length} saved canon ${nodes.length === 1 ? 'scene' : 'scenes'} restored from this browser’s evidence ledger.` : activeAtlasMode === 'breaks' ? 'The sample graph is showing the linked break path in The Last Loop. Import a script to map your own scenes.' : activeAtlasMode === 'evidence' ? 'The sample graph is showing evidence-bearing scenes in The Last Loop. Import a script to map your own scenes.' : 'The sample graph links the fixed events that drive The Last Loop. Import a script to map every detected scene.';
}

function updatePrivacyNote(sourceCount) {
  privacyNote.innerHTML = `<span class="lock">⌁</span> ${sourceCount} imported ${sourceCount === 1 ? 'source stays' : 'sources stay'} in this browser. Nothing is uploaded.`;
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
  currentAnnotations = Object.values(issues).flatMap((finding) => finding.annotationLines || []);
  downloadAnnotated.hidden = !(sourcePdfFile && currentAnnotations.length);
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
  currentAnnotations = [];
  downloadAnnotated.hidden = true;
  issuesRoot.innerHTML = '<p class="empty-queue">No deterministic contradictions found in these sources.</p>';
  copyRoot.innerHTML = '<p class="eyebrow">LOCAL CHECK COMPLETE</p><h3>No hard conflicts surfaced.</h3><p>The imported pages were indexed for explicit deaths, injuries, phone states, and numeric-code reveals. Add another revision or more concrete scene action to deepen the comparison.</p>';
  nodesRoot.innerHTML = '';
  lines.innerHTML = '';
  response.innerHTML = '<span class="response-kicker">LOCAL MEMORY READY</span><p>I found no explicit state reversals in the imported pages. This is a deterministic first-pass check, so editor review remains the source of truth.</p>';
}

function renderImportedStoryOverview(memory, role, totalPages) {
  const scenePanel = document.querySelector('.scene-panel');
  const firstScene = memory.lines.find((line) => line.sceneNumber) || memory.lines[0];
  const sceneLabel = firstScene?.sceneLabel?.replace(/^Scene \d+: /, '') || 'Imported pages';
  const sourceName = firstScene?.file || 'Your source';
  const mappedScenes = memory.sceneCount || 0;
  const graphSceneCount = Math.min(mappedScenes, 36);
  const characterCount = memory.characters.length;
  const factCount = memory.facts.length;
  const roleLabel = role === 'revision' ? 'INCOMING REVISION' : 'CANON BASELINE';
  const nextStep = role === 'revision'
    ? (projectLedger.facts.some((fact) => fact.locked) ? 'Checking this revision against your approved locks now.' : 'No approved locks yet. Add a canon source and lock the facts you want protected.')
    : 'This is your baseline, not a contradiction verdict. Add the next draft when you want a comparison.';
  scenePanel.innerHTML = `
    <div class="section-heading">
      <div><p class="eyebrow">${roleLabel} / LOCAL INDEX</p><h2>${escapeHtml(sourceName.replace(/\.[^.]+$/, ''))} is <em>mapped.</em></h2></div>
      <span class="page-chip">${totalPages ? `${totalPages} PAGES` : `${mappedScenes} SCENES`}</span>
    </div>
    <article class="script-paper story-overview" aria-label="Imported story overview">
      <p class="slug">${escapeHtml(sceneLabel)}</p>
      <p><strong>${mappedScenes || 'No'} screenplay ${mappedScenes === 1 ? 'scene' : 'scenes'} indexed</strong> from real scene headings. Front matter and title pages are left out; the graph starts with ${graphSceneCount || 'the available'} readable ${graphSceneCount === 1 ? 'scene' : 'scenes'}.</p>
      <p><strong>${characterCount || 'No'} character ${characterCount === 1 ? 'thread' : 'threads'} recognized</strong>${characterCount ? `: ${escapeHtml(memory.characters.slice(0, 6).join(', '))}${characterCount > 6 ? '…' : ''}.` : '.'}</p>
      <p><strong>${factCount} high-confidence canon ${factCount === 1 ? 'candidate' : 'candidates'}</strong> found from explicit, named story states. Ambiguous phrases and pronouns are intentionally not turned into canon.</p>
      <p class="overview-next"><strong>What happens next:</strong> ${escapeHtml(nextStep)}</p>
    </article>
    <div class="scene-footer"><span><i></i> ${role === 'revision' ? 'Revision ready for comparison' : 'Canon stays in this browser'}</span><button class="text-button" data-open-revision>${role === 'revision' ? 'Review the story map ↗' : 'Add an incoming revision ↗'}</button></div>`;
}

function renderCanonBaselineReady(memory) {
  currentAnnotations = [];
  downloadAnnotated.hidden = true;
  const sceneCount = memory.sceneCount || 0;
  issuesRoot.innerHTML = '<p class="empty-queue">Baseline indexed — no revision has been compared yet.</p>';
  copyRoot.innerHTML = `<p class="eyebrow">CANON BASELINE READY</p><h3>Nothing is “broken” yet.</h3><p>You added one source of truth. storyIsStraight indexed ${sceneCount || 'the'} screenplay ${sceneCount === 1 ? 'scene' : 'scenes'} and only proposes explicit, named states as canon. Import a later draft as an Incoming revision to reveal changes that conflict with approved locks.</p>`;
  nodesRoot.innerHTML = '';
  lines.innerHTML = '';
  response.innerHTML = `<span class="response-kicker">FIRST PASS COMPLETE</span><p><b>${sceneCount || 'Your'} scenes are indexed locally.</b> The graph opens with a readable scene map; continuity checks become useful once you compare a revision against the facts you approve.</p>`;
}

function renderRevisionNeedsLocks() {
  currentAnnotations = [];
  downloadAnnotated.hidden = true;
  issuesRoot.innerHTML = '<p class="empty-queue">No approved canon locks available for this comparison.</p>';
  copyRoot.innerHTML = '<p class="eyebrow">REVISION INDEXED</p><h3>Choose what must stay true first.</h3><p>This incoming draft is mapped, but a comparison needs at least one approved fact from a canon source. Import the baseline, lock the facts you trust, then add this revision again.</p>';
  nodesRoot.innerHTML = '';
  lines.innerHTML = '';
  response.innerHTML = '<span class="response-kicker">WAITING FOR CANON</span><p>I did not invent a verdict. Add or lock baseline evidence, then I will compare this draft against it.</p>';
}

function reviewCurrentStory() {
  if (!storyMemory) return;
  const lockedFacts = projectLedger.facts.filter((fact) => fact.locked).length;
  if (currentImportRole === 'canon') {
    status.textContent = 'Canon baseline indexed locally. Add a later draft to compare changes against approved facts.';
    statusMeta.textContent = `${storyMemory.sceneCount || storyMemory.lines.length} scenes · ${storyMemory.characters.length} character threads · local-only`;
    renderCanonBaselineReady(storyMemory);
    return;
  }
  if (!lockedFacts) {
    status.textContent = 'Incoming revision indexed, but no approved canon locks are available for a truthful comparison.';
    statusMeta.textContent = `${storyMemory.sceneCount || storyMemory.lines.length} scenes · waiting for canon`;
    renderRevisionNeedsLocks();
    return;
  }
  issues = analyzeImportedMemory(revisionReviewMemory());
  const importedKeys = Object.keys(issues);
  if (!importedKeys.length) {
    status.textContent = 'No deterministic canon breaks found against your approved locks.';
    statusMeta.textContent = `${lockedFacts} locks checked · local-only`;
    renderNoImportedBreaks();
    return;
  }
  activeKey = importedKeys[0];
  status.textContent = `${importedKeys.length} source-backed ${importedKeys.length === 1 ? 'break' : 'breaks'} found. Each alert includes the exact earlier and later claims.`;
  statusMeta.textContent = `${importedKeys.length} breaks · ${lockedFacts} approved locks · local-only`;
  renderImpact(activeKey);
}

function revisionReviewMemory() {
  const locks = projectLedger.facts.filter((fact) => fact.locked);
  if (currentImportRole !== 'revision' || !locks.length || !storyMemory) return storyMemory;
  const lockedLines = locks.map((fact, index) => ({ ...fact.line, origin: 'canon', index: index - locks.length - 1, canonIndex: fact.line.index }));
  const revisionLines = storyMemory.lines.map((line, index) => ({ ...line, origin: 'revision', index: index + 1 }));
  return { facts: locks, lines: [...lockedLines, ...revisionLines], characters: storyMemory.characters };
}

document.querySelector('#run-analysis').addEventListener('click', () => {
  const button = document.querySelector('#run-analysis');
  button.disabled = true;
  button.textContent = storyMemory ? 'Checking story memory…' : 'Reading revision…';
  status.textContent = 'Story agent is extracting people, objects, knowledge, time, and irreversible events.';
  const lockedFacts = projectLedger.facts.filter((fact) => fact.locked).length;
  statusMeta.textContent = storyMemory ? (currentImportRole === 'revision' && lockedFacts ? `Comparing revision against ${lockedFacts} locked facts` : `Checking local sources against ${storyMemory.facts.length} extracted facts`) : 'Checking 4 claims against 26 facts';
  setTimeout(() => {
    button.innerHTML = '<span class="spark">✦</span> Analysis complete';
    button.disabled = false;
    if (!storyMemory) {
      status.textContent = '4 canon breaks found. Each one is linked to the locked evidence and the later beats it changes.';
      statusMeta.textContent = '4 breaks · 8 downstream beats';
      renderImpact('code');
      return;
    }
    reviewCurrentStory();
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

function setImportError(message = '') {
  importError.hidden = !message;
  importError.textContent = message;
}

function setCloudError(message = '') {
  cloudError.hidden = !message;
  cloudError.textContent = message;
}

function setCanonAiError(message = '') {
  canonAiError.hidden = !message;
  canonAiError.textContent = message;
}

function setManualFactError(message = '') {
  manualFactError.hidden = !message;
  manualFactError.textContent = message;
}

function openManualFactDialog() {
  setManualFactError();
  manualFactForm.reset();
  manualFactDialog.showModal();
}

function saveManualFact(event) {
  event.preventDefault();
  const label = document.querySelector('#manual-fact-label').value.trim();
  const sceneLabel = document.querySelector('#manual-fact-scene').value.trim() || 'Manual canon note';
  const excerpt = document.querySelector('#manual-fact-evidence').value.trim();
  if (!label || !excerpt) {
    setManualFactError('Add both the fact and the exact supporting excerpt.');
    return;
  }
  const sourceName = projectLedger.sources.find((source) => source.role === 'canon')?.name || projectTitle.textContent || 'Manual canon note';
  const fact = {
    id: `manual|${label.toLowerCase()}|${sceneLabel.toLowerCase()}`,
    type: 'manual',
    label,
    detail: 'Approved manual canon lock',
    line: { file: sourceName, sceneLabel, lineNumber: 0, text: excerpt },
    locked: true
  };
  const existing = projectLedger.facts.findIndex((saved) => saved.id === fact.id);
  if (existing >= 0) projectLedger.facts[existing] = fact;
  else projectLedger.facts.push(fact);
  saveProjectLedger();
  refreshSavedProject();
  if (currentImportRole === 'revision') reviewCurrentStory();
  manualFactDialog.close();
  status.textContent = `Locked “${label}” as approved canon. It is ready for comparison and opt-in AI evidence review.`;
  statusMeta.textContent = `${projectLedger.facts.filter((saved) => saved.locked).length} approved locks · local-only`;
}

function cloudReviewPayload() {
  const lockedFacts = projectLedger.facts.filter((fact) => fact.locked);
  if (!storyMemory || currentImportRole !== 'revision') throw new Error('Import the current draft as an Incoming draft before running cloud evidence review.');
  if (!lockedFacts.length) throw new Error('Lock at least one canon fact before running cloud evidence review.');
  return {
    consent: true,
    projectTitle: projectTitle.textContent,
    lockedFacts,
    revisionText: storyMemory.lines.map((line) => line.text).join('\n').slice(0, 120000)
  };
}

function cloudRequirement(label, ready, detail) {
  return `<div class="ai-requirement ${ready ? 'ready' : 'waiting'}"><span>${ready ? '✓' : '○'}</span><div><b>${escapeHtml(label)}</b><small>${escapeHtml(detail)}</small></div></div>`;
}

function renderCloudReadiness() {
  const hasRevision = Boolean(storyMemory && currentImportRole === 'revision');
  const lockedCount = projectLedger.facts.filter((fact) => fact.locked).length;
  const serviceReady = cloudConfigured === true;
  aiReadiness.innerHTML = [
    cloudRequirement('Incoming draft', hasRevision, hasRevision ? 'Current revision is ready to review.' : 'Add pages as an Incoming draft.'),
    cloudRequirement('Approved canon', lockedCount > 0, lockedCount ? `${lockedCount} locked ${lockedCount === 1 ? 'fact is' : 'facts are'} ready.` : 'Lock at least one fact you want protected.'),
    cloudRequirement('AI service', serviceReady, cloudConfigured === null ? 'Checking secure service connection…' : serviceReady ? 'Gemini Enterprise + ClickHouse connected.' : 'Cloud service is unavailable right now.')
  ].join('');
  const next = !hasRevision ? { action: 'revision', label: 'Add an incoming draft ↗' } : !lockedCount ? { action: 'lock', label: 'Lock a canon fact ↗' } : null;
  aiNextStep.hidden = !next;
  if (next) {
    aiNextStep.dataset.aiAction = next.action;
    aiNextStep.textContent = next.label;
  }
  cloudReviewButton.disabled = !(hasRevision && lockedCount && serviceReady && cloudConsent.checked);
}

async function refreshCloudReadiness() {
  cloudConfigured = null;
  renderCloudReadiness();
  try {
    const healthResponse = await fetch('/api/health', { cache: 'no-store' });
    const health = await healthResponse.json();
    cloudConfigured = Boolean(healthResponse.ok && health.configured);
  } catch {
    cloudConfigured = false;
  }
  renderCloudReadiness();
}

function renderCanonAiReadiness() {
  const hasCanon = Boolean(storyMemory && currentImportRole === 'canon');
  const hasSavedCanon = projectLedger.sources.some((source) => source.role === 'canon');
  const serviceReady = cloudConfigured === true;
  canonAiReadiness.innerHTML = [
    cloudRequirement('Canon source', hasCanon, hasCanon ? 'The currently loaded canon pages are ready.' : hasSavedCanon ? 'Re-open the canon source locally. Full script text is not retained after refresh.' : 'Import the trusted draft as a Canon source.'),
    cloudRequirement('AI service', serviceReady, cloudConfigured === null ? 'Checking secure service connection…' : serviceReady ? 'Gemini Enterprise connected.' : 'Cloud service is unavailable right now.'),
    cloudRequirement('Your approval', canonAiConsent.checked, canonAiConsent.checked ? 'You approved sending this canon source for suggestions.' : 'Consent is required before any text leaves this browser.')
  ].join('');
  canonAiNextStep.hidden = hasCanon;
  if (!hasCanon) {
    canonAiNextStep.dataset.canonAiAction = 'canon';
    canonAiNextStep.textContent = hasSavedCanon ? 'Re-open canon source ↗' : 'Add a canon source ↗';
  }
  canonAiButton.disabled = !(hasCanon && serviceReady && canonAiConsent.checked);
}

async function refreshCanonAiReadiness() {
  cloudConfigured = null;
  renderCanonAiReadiness();
  try {
    const healthResponse = await fetch('/api/health', { cache: 'no-store' });
    const health = await healthResponse.json();
    cloudConfigured = Boolean(healthResponse.ok && health.configured);
  } catch {
    cloudConfigured = false;
  }
  renderCanonAiReadiness();
}

function canonCandidatePayload() {
  if (!storyMemory || currentImportRole !== 'canon') throw new Error('Import the trusted draft as a Canon source before generating candidates.');
  return {
    consent: true,
    projectTitle: projectTitle.textContent,
    canonText: storyMemory.lines.map((line) => `[${line.sceneLabel}] ${line.text}`).join('\n').slice(0, 120000),
    sourceName: projectLedger.sources.find((source) => source.role === 'canon')?.name || projectTitle.textContent
  };
}

function ingestCanonCandidates(candidates, sourceName) {
  const allowedTypes = new Set(['relationship', 'timeline', 'knowledge', 'motivation', 'prop', 'state', 'location', 'wardrobe', 'other']);
  let added = 0;
  candidates.slice(0, 30).forEach((candidate, index) => {
    const label = cleanExcerpt(String(candidate.label || '').trim(), 180);
    const excerpt = cleanExcerpt(String(candidate.evidence || '').trim(), 1200);
    if (!label || !excerpt) return;
    const type = allowedTypes.has(String(candidate.type || '').toLowerCase()) ? String(candidate.type).toLowerCase() : 'other';
    const sceneLabel = cleanExcerpt(String(candidate.scene_label || candidate.sceneLabel || 'Imported canon').trim(), 100);
    const fact = {
      id: `ai|${type}|${label.toLowerCase()}|${sceneLabel.toLowerCase()}|${index}`,
      type,
      label,
      detail: `AI candidate · ${cleanExcerpt(String(candidate.why || candidate.reason || 'Review the supporting excerpt before locking.'), 110)}`,
      line: { file: sourceName, sceneLabel, lineNumber: Number(candidate.line_number || candidate.lineNumber || 0), text: excerpt },
      origin: 'ai',
      locked: false
    };
    if (!projectLedger.facts.some((saved) => saved.id === fact.id || (saved.label === fact.label && saved.line.text === fact.line.text))) {
      projectLedger.facts.push(fact);
      added += 1;
    }
  });
  saveProjectLedger();
  refreshSavedProject();
  renderStoryGraph(storyMemory);
  return added;
}

async function runCanonAi() {
  canonAiButton.disabled = true;
  canonAiButton.textContent = 'Finding candidate facts…';
  setCanonAiError();
  try {
    const serverResponse = await fetch('/api/agent/canon-candidates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(canonCandidatePayload()) });
    const payload = await serverResponse.json();
    if (!serverResponse.ok) throw new Error(payload.error || 'AI canon extraction could not be completed.');
    const added = ingestCanonCandidates(Array.isArray(payload.candidates) ? payload.candidates : [], canonCandidatePayload().sourceName);
    const candidateCount = Array.isArray(payload.candidates) ? payload.candidates.length : 0;
    response.innerHTML = `<span class="response-kicker">GEMINI CANON CANDIDATES</span><p><b>${added || candidateCount} reviewable ${added === 1 || candidateCount === 1 ? 'fact was' : 'facts were'} added to the ledger.</b> Read the supporting excerpt, then lock only the rules you want this story to preserve.</p>`;
    status.textContent = `${added || candidateCount} AI canon candidates are ready for your review. Nothing was locked automatically.`;
    statusMeta.textContent = 'Gemini suggestions · human approval required';
    canonAiDialog.close();
  } catch (error) {
    setCanonAiError(error.message);
  } finally {
    canonAiButton.textContent = 'Generate reviewable candidates';
    renderCanonAiReadiness();
  }
}

function renderCloudFindings(review) {
  const findings = Array.isArray(review?.findings) ? review.findings.slice(0, 4) : [];
  if (!findings.length) return;
  issues = Object.fromEntries(findings.map((finding, index) => [`cloud-${index}`, {
    number: `AI ${String(index + 1).padStart(2, '0')}`,
    title: finding.title || 'Continuity concern',
    severity: String(finding.severity || 'review').toUpperCase(),
    summary: finding.why || 'The agent found a source-backed concern.',
    heading: finding.title || 'Evidence-backed continuity concern.',
    copy: `${finding.why || 'Review this claim against the cited canon evidence.'} Smallest repair: ${finding.smallest_repair || 'Review this beat with the story editor.'}`,
    evidence: `GEMINI EVIDENCE · ${finding.evidence || 'Retrieved canon evidence'}`,
    nodes: [
      ['CANON EVIDENCE', finding.evidence || 'Approved source', 'Retrieved from ClickHouse'],
      ['INCOMING DRAFT', finding.title || 'Continuity concern', 'Gemini evidence review'],
      ['SMALLEST REPAIR', finding.smallest_repair || 'Editor review required', 'Recommended next edit']
    ]
  }]));
  activeKey = 'cloud-0';
  renderImpact(activeKey);
  response.innerHTML = `<span class="response-kicker">GEMINI ENTERPRISE / CLICKHOUSE</span><p><b>${escapeHtml(review.summary || `${findings.length} evidence-backed ${findings.length === 1 ? 'concern' : 'concerns'} found.`)}</b> The AI findings are now mapped below as repair paths.</p>`;
}

async function runCloudReview() {
  cloudReviewButton.disabled = true;
  cloudReviewButton.textContent = 'Retrieving evidence…';
  setCloudError();
  try {
    const cloudHttpResponse = await fetch('/api/agent/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cloudReviewPayload()) });
    const payload = await cloudHttpResponse.json();
    if (!cloudHttpResponse.ok) throw new Error(payload.error || 'Cloud evidence review could not be completed.');
    const findings = Array.isArray(payload.review?.findings) ? payload.review.findings.slice(0, 4) : [];
    if (findings.length) renderCloudFindings(payload.review);
    else response.innerHTML = `<span class="response-kicker">GEMINI ENTERPRISE / CLICKHOUSE</span><p><b>${escapeHtml(payload.review?.summary || 'Cloud evidence review complete.')}</b> No additional evidence-backed concerns were returned.</p>`;
    status.textContent = `Cloud evidence review completed using ${payload.evidenceCount} locked facts retrieved from ClickHouse.`;
    statusMeta.textContent = 'Gemini Enterprise agent · ClickHouse evidence';
    renderStoryGraph(storyMemory);
    cloudDialog.close();
  } catch (error) {
    setCloudError(error.message);
  } finally {
    cloudReviewButton.textContent = 'Run cloud evidence review';
    renderCloudReadiness();
  }
}

function drawPdfWrapped(page, text, x, y, width, font, size, color = rgb(0.15, 0.15, 0.12), leading = 13) {
  const words = String(text || '').split(/\s+/);
  let line = '';
  let cursor = y;
  words.forEach((word) => {
    const candidate = `${line} ${word}`.trim();
    if (font.widthOfTextAtSize(candidate, size) > width && line) {
      page.drawText(line, { x, y: cursor, size, font, color });
      cursor -= leading;
      line = word;
    } else line = candidate;
  });
  if (line) {
    page.drawText(line, { x, y: cursor, size, font, color });
    cursor -= leading;
  }
  return cursor;
}

function linePageAndPosition(line, pageCount) {
  if (!sourcePdfPageLineCounts.length) return { pageIndex: 0, lineWithinPage: 3 };
  let consumed = 0;
  for (let index = 0; index < sourcePdfPageLineCounts.length; index += 1) {
    const count = sourcePdfPageLineCounts[index];
    if (line.pageNumber === index + 1 || line.lineNumber <= consumed + count) {
      return { pageIndex: Math.min(index, pageCount - 1), lineWithinPage: Math.max(0, line.lineNumber - consumed - 1), pageY: line.pageY };
    }
    consumed += count;
  }
  return { pageIndex: pageCount - 1, lineWithinPage: 3 };
}

async function downloadAnnotatedPdf() {
  if (!sourcePdfFile || !currentAnnotations.length) return;
  downloadAnnotated.disabled = true;
  downloadAnnotated.textContent = 'Preparing annotated PDF…';
  try {
    const pdf = await PDFDocument.load(await sourcePdfFile.arrayBuffer());
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const seen = new Set();
    const palette = {
      'Earlier canon': { fill: rgb(0.95, 0.72, 0.22), label: 'CANON' },
      'Conflicting revision': { fill: rgb(0.93, 0.38, 0.25), label: 'BREAK' },
      'Downstream beat': { fill: rgb(0.48, 0.72, 0.56), label: 'IMPACT' }
    };
    currentAnnotations.forEach((line) => {
      const key = `${line.file}|${line.lineNumber}|${line.annotationRole}`;
      if (seen.has(key)) return;
      seen.add(key);
      const { pageIndex, lineWithinPage, pageY } = linePageAndPosition(line, pdf.getPageCount());
      const page = pdf.getPages()[pageIndex];
      const height = page.getHeight();
      const width = page.getWidth();
      const y = Math.max(52, pageY || (height - 78 - (lineWithinPage * 14)));
      const colorsForRole = palette[line.annotationRole] || palette['Conflicting revision'];
      page.drawRectangle({ x: 46, y: y - 3, width: width - 92, height: 15, color: colorsForRole.fill, opacity: 0.32, borderColor: colorsForRole.fill, borderOpacity: 0.75, borderWidth: 0.7 });
      page.drawText(colorsForRole.label, { x: width - 86, y: y + 1, size: 6.5, font: bold, color: colorsForRole.fill });
    });
    let report = pdf.addPage([612, 792]);
    report.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(0.97, 0.96, 0.92) });
    report.drawText('storyIsStraight', { x: 54, y: 710, size: 25, font: bold, color: rgb(0.14, 0.14, 0.12) });
    report.drawText('ANNOTATED CONTINUITY REVIEW', { x: 54, y: 681, size: 9, font: bold, color: rgb(0.65, 0.39, 0.12) });
    report.drawText('Highlighted pages show the evidence path behind this review.', { x: 54, y: 650, size: 10, font: regular, color: rgb(0.35, 0.35, 0.31) });
    let y = 610;
    Object.values(issues).slice(0, 8).forEach((issue, index) => {
      report.drawText(`${String(index + 1).padStart(2, '0')}  ${issue.title || 'Continuity finding'}`, { x: 54, y, size: 11, font: bold, color: rgb(0.14, 0.14, 0.12) });
      y -= 17;
      y = drawPdfWrapped(report, issue.copy || issue.summary || 'Review the highlighted source lines.', 72, y, 480, regular, 9, rgb(0.33, 0.33, 0.30), 13);
      y -= 15;
      if (y < 92) {
        report = pdf.addPage([612, 792]);
        report.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(0.97, 0.96, 0.92) });
        y = 720;
      }
    });
    const bytes = await pdf.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${sourcePdfFile.name.replace(/\.pdf$/i, '')}-annotated.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    status.textContent = 'Annotated PDF downloaded with highlighted evidence and a review appendix.';
    statusMeta.textContent = `${seen.size} highlighted source lines · local-only export`;
  } catch (error) {
    status.textContent = `Could not create the annotated PDF: ${error.message}`;
    statusMeta.textContent = 'Original PDF was not changed';
  } finally {
    downloadAnnotated.disabled = false;
    downloadAnnotated.textContent = 'Download annotated PDF';
  }
}

function addFiles(files) {
  const allowable = Array.from(files).filter((file) => /\.(txt|fountain|fdx|pdf|docx)$/i.test(file.name));
  const newFiles = allowable.filter((file) => !stagedFiles.some(({ file: staged }) => staged.name === file.name && staged.size === file.size));
  stagedFiles = [...stagedFiles, ...newFiles.map((file) => ({ file }))];
  uploadInput.value = '';
  setImportError();
  renderImportQueue();
}

function countScenes(text) {
  return (text.match(/(?:^|\n)\s*(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.)/gim) || []).length;
}

async function extractPdf(file, onProgress) {
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  const pages = [];
  const pageLineYPositions = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress(`Reading ${file.name}: page ${pageNumber} of ${pdf.numPages}`);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageLines = [];
    const lineYPositions = [];
    let activeLine = [];
    let activeLineY = null;
    let previousY = null;
    content.items.forEach((item) => {
      const y = item.transform?.[5];
      if (previousY !== null && Number.isFinite(y) && Math.abs(y - previousY) > 2.5 && activeLine.length) {
        pageLines.push(activeLine.join(' '));
        lineYPositions.push(activeLineY);
        activeLine = [];
        activeLineY = null;
      }
      if (item.str) {
        activeLine.push(item.str);
        if (activeLineY === null && Number.isFinite(y)) activeLineY = y;
      }
      if (Number.isFinite(y)) previousY = y;
    });
    if (activeLine.length) {
      pageLines.push(activeLine.join(' '));
      lineYPositions.push(activeLineY);
    }
    pages.push(pageLines.join('\n'));
    pageLineYPositions.push(lineYPositions);
  }
  return { text: pages.join('\n'), pages: pdf.numPages, pageLineCounts: pages.map((page) => page.split(/\r?\n/).length), pageLineYPositions };
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
  setImportError();
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
    const pdfEntry = extracted.find((entry) => /\.pdf$/i.test(entry.file.name));
    sourcePdfFile = pdfEntry?.file || null;
    sourcePdfPageLineCounts = pdfEntry?.pageLineCounts || [];
    storyMemory = buildLocalStoryMemory(extracted);
    currentImportRole = importRole.value;
    if (!projectLedger.title || currentImportRole === 'canon') projectLedger.title = primaryFile.name.replace(/\.[^.]+$/, '');
    projectLedger.sources.push(...extracted.map((entry) => ({ name: entry.file.name, role: currentImportRole, scenes: entry.scenes, pages: entry.pages, addedAt: Date.now() })));
    if (currentImportRole === 'canon') mergeFactsIntoLedger(storyMemory.facts);
    saveProjectLedger();
    projectTitle.textContent = primaryFile.name.replace(/\.[^.]+$/, '');
    projectMeta.textContent = `${currentImportRole === 'revision' ? 'Revision' : 'Canon'} · ${totalScenes || totalPages || 'story'} ${totalScenes === 1 ? 'scene' : totalScenes ? 'scenes' : totalPages === 1 ? 'page' : totalPages ? 'pages' : 'indexed'}`;
    stagedFiles = [];
    refreshSavedProject();
    renderImportedFacts(storyMemory);
    renderStoryGraph(storyMemory);
    renderImportedStoryOverview(storyMemory, currentImportRole, totalPages);
    reviewCurrentStory();
    renderImportQueue();
    importDialog.close();
  } catch (error) {
    status.textContent = `Could not read the selected file: ${error.message}`;
    statusMeta.textContent = 'Nothing was uploaded or sent';
    setImportError(`Could not read this document. ${error.message} Remove it or choose another file.`);
  } finally {
    useImport.textContent = 'Build story memory';
    useImport.disabled = !stagedFiles.length;
  }
}

document.querySelector('#open-upload').addEventListener('click', () => importDialog.showModal());
document.querySelector('#close-upload').addEventListener('click', () => { setImportError(); importDialog.close(); });
document.querySelector('#open-cloud-review').addEventListener('click', async () => {
  setCloudError();
  cloudConsent.checked = false;
  cloudDialog.showModal();
  await refreshCloudReadiness();
});
document.querySelector('#open-canon-ai').addEventListener('click', async () => {
  setCanonAiError();
  canonAiConsent.checked = false;
  canonAiDialog.showModal();
  await refreshCanonAiReadiness();
});
document.querySelector('#close-cloud').addEventListener('click', () => { setCloudError(); cloudDialog.close(); });
document.querySelector('#close-canon-ai').addEventListener('click', () => { setCanonAiError(); canonAiDialog.close(); });
cloudConsent.addEventListener('change', renderCloudReadiness);
canonAiConsent.addEventListener('change', renderCanonAiReadiness);
cloudReviewButton.addEventListener('click', runCloudReview);
canonAiButton.addEventListener('click', runCanonAi);
downloadAnnotated.addEventListener('click', downloadAnnotatedPdf);
aiNextStep.addEventListener('click', () => {
  const action = aiNextStep.dataset.aiAction;
  cloudDialog.close();
  if (action === 'revision') {
    importRole.value = 'revision';
    importDialog.showModal();
  }
  if (action === 'lock') openManualFactDialog();
});
canonAiNextStep.addEventListener('click', () => {
  canonAiDialog.close();
  importRole.value = 'canon';
  importDialog.showModal();
});
document.querySelector('#close-manual-fact').addEventListener('click', () => { setManualFactError(); manualFactDialog.close(); });
manualFactForm.addEventListener('submit', saveManualFact);
document.addEventListener('click', (event) => {
  const workflowAction = event.target.closest('[data-workflow-action]');
  if (workflowAction) {
    const action = workflowAction.dataset.workflowAction;
    if (action === 'canon' || action === 'revision') {
      importRole.value = action;
      importDialog.showModal();
    }
    if (action === 'candidates') document.querySelector('#open-canon-ai').click();
    if (action === 'lock') openManualFactDialog();
    return;
  }
  if (event.target.closest('[data-open-manual-fact]')) {
    openManualFactDialog();
    return;
  }
  const action = event.target.closest('[data-open-revision]');
  if (!action) return;
  if (currentImportRole === 'revision') document.querySelector('#story-map').scrollIntoView({ behavior: 'smooth' });
  else {
    importRole.value = 'revision';
    importDialog.showModal();
  }
});
uploadInput.addEventListener('change', (event) => addFiles(event.target.files));
useImport.addEventListener('click', buildStoryMemory);
importQueue.addEventListener('click', (event) => {
  const remove = event.target.closest('[data-remove-file]');
  if (!remove) return;
  stagedFiles.splice(Number(remove.dataset.removeFile), 1);
  uploadInput.value = '';
  setImportError();
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

function lockFact(id) {
  let saved = projectLedger.facts.find((fact) => fact.id === id);
  if (!saved) {
    const current = (storyMemory?.facts || []).find((fact) => factId(fact) === id);
    if (!current) return;
    saved = storedFact(current);
    projectLedger.facts.push(saved);
  }
  saved.locked = true;
  saveProjectLedger();
  refreshSavedProject();
  status.textContent = `${saved.label} is now locked in this browser’s canon ledger.`;
  statusMeta.textContent = `${projectLedger.facts.filter((fact) => fact.locked).length} locked facts · local-only`;
}

document.querySelector('.fact-list').addEventListener('click', (event) => {
  const fact = event.target.closest('[data-lock-fact]');
  if (fact) lockFact(fact.dataset.lockFact);
});

document.querySelectorAll('.nav-item').forEach((link) => link.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach((item) => {
    const active = item === link;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}));

storyGraphNodes.addEventListener('click', (event) => {
  const node = event.target.closest('[data-graph-node]');
  if (!node) return;
  activeGraphNode = Number(node.dataset.graphNode);
  renderStoryGraph(storyMemory);
});

sceneIndexList.addEventListener('click', (event) => {
  const row = event.target.closest('[data-atlas-scene]');
  if (!row) return;
  activeGraphNode = Number(row.dataset.atlasScene);
  if (activeGraphNode >= 36) showFullMap = true;
  renderStoryGraph(storyMemory);
  document.querySelector('.story-graph-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

characterFilters.addEventListener('click', (event) => {
  const filter = event.target.closest('[data-character-filter]');
  if (!filter) return;
  activeCharacter = filter.dataset.characterFilter;
  activeGraphNode = 0;
  renderStoryGraph(storyMemory);
});

atlasModes.addEventListener('click', (event) => {
  const mode = event.target.closest('[data-atlas-mode]');
  if (!mode) return;
  activeAtlasMode = mode.dataset.atlasMode;
  activeGraphNode = 0;
  showFullMap = false;
  renderStoryGraph(storyMemory);
});

atlasExpand.addEventListener('click', () => {
  showFullMap = !showFullMap;
  activeGraphNode = 0;
  renderStoryGraph(storyMemory);
});

storyGraphDetail.addEventListener('click', (event) => {
  const button = event.target.closest('[data-lock-scene]');
  if (!button || !storyMemory) return;
  const facts = storyMemory.facts.filter((fact) => fact.line.sceneLabel === button.dataset.lockScene || fact.line.sceneLabel.startsWith(`${button.dataset.lockScene}:`));
  facts.forEach((fact) => lockFact(factId(fact)));
});

clearProject.addEventListener('click', () => {
  if (!window.confirm('Start a new local series? This removes saved source names and locked facts from this browser.')) return;
  localStorage.removeItem(projectStorageKey);
  projectLedger = { title: '', sources: [], facts: [] };
  storyMemory = null;
  currentImportRole = 'canon';
  window.location.reload();
});

renderImpact(activeKey);
renderStoryGraph();
readProjectLedger();
refreshSavedProject();
renderStoryGraph();
