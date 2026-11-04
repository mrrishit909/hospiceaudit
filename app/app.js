// DOM wiring for the HospiceAudit workbench. Imports the REAL engine from
// src/ and the pure helpers from ui.js. Renders exclusively through
// createElement/textContent: no innerHTML, no eval, no network, no CDN.
// Only node:test-free browser code lives here; ui.js stays DOM-free.

import {
  parseInput,
  evaluate,
  LIMITS,
  RULE_PACK,
  RULE_IDS,
  KINDS,
  DECISIONS,
  MAX_NOTE_LENGTH,
  ReviewLayer,
  buildExport,
  serializeExport,
  findingsToCsv,
} from '../src/index.js';
import { UI_FIXTURES } from '../fixtures/index.js';
import {
  filterFindings,
  formatDate,
  timelineGeometry,
  formatErrors,
  bufferToHex,
  sourceFromFixture,
  sourceFromLocalFile,
  originShortLabel,
  originNotice,
  runStatusText,
} from './ui.js';

const state = {
  sourceName: '',
  sourceText: '',
  origin: null, // set only by sourceFromFixture / sourceFromLocalFile
  loadSeq: 0, // guards the async source hash against a newer load
  data: null, // validated input (parseInput ok)
  errors: [], // validation errors (invalid-file state)
  report: null, // frozen report from evaluate()
  review: new ReviewLayer(),
  filters: { ruleId: '', kind: '', query: '' },
  selectedId: null,
  sourceHash: null,
};

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'text') node.textContent = String(value);
    else if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function setStatus(id, text, tone = 'muted') {
  const node = $(id);
  node.textContent = text;
  node.dataset.tone = tone;
}

function table(caption, headers, rows) {
  if (rows.length === 0) return el('p', { class: 'empty', text: `${caption}: none in this input.` });
  return el('table', {}, [
    el('caption', { text: caption }),
    el('thead', {}, el('tr', {}, headers.map((h) => el('th', { scope: 'col', text: h })))),
    el('tbody', {}, rows.map((cells) => el('tr', {}, cells.map((c) => el('td', { class: 'mono' }, c))))),
  ]);
}

function kvTable(caption, record) {
  if (!record || typeof record !== 'object') return el('p', { class: 'empty', text: `${caption}: not cited by this finding.` });
  return el('table', { class: 'kv' }, [
    el('caption', { text: caption }),
    el('tbody', {}, Object.entries(record).map(([k, v]) => el('tr', {}, [el('th', { scope: 'row', text: k }), el('td', { class: 'mono', text: v === null ? 'null' : String(v) })]))),
  ]);
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function hashText(text) {
  try {
    if (!globalThis.crypto?.subtle) return null;
    return bufferToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  } catch {
    return null;
  }
}

// `source` comes from sourceFromFixture or sourceFromLocalFile (ui.js); its
// origin is fixed by the control used, never by the file's content.
async function loadSource({ name, text, origin }) {
  const seq = ++state.loadSeq;
  state.sourceName = name;
  state.sourceText = text;
  state.origin = origin;
  state.report = null;
  state.selectedId = null;
  state.review = new ReviewLayer();
  state.sourceHash = null;
  clearRunStatuses();
  const parsed = parseInput(text);
  if (parsed.ok) {
    state.data = parsed.data;
    state.errors = [];
    const n = parsed.data.episodes.length + parsed.data.documents.length + parsed.data.requirements.length;
    const label = originShortLabel(origin);
    setStatus('load-status', n === 0 ? `${name}: valid but empty (no records), labelled ${label}. Run the rules to confirm an empty result.` : `${name}: valid input, ${n} records loaded, labelled ${label}. Inspect them below, then run the rules.`, 'ok');
  } else {
    state.data = null;
    state.errors = parsed.errors;
    setStatus('load-status', `${name}: rejected, ${parsed.errors.length} validation error(s). Nothing was processed.`, 'error');
  }
  render();
  const hash = await hashText(text);
  if (seq !== state.loadSeq) return; // a newer load replaced this one
  state.sourceHash = hash;
  renderExport();
}

// A previous run's status names that run's data origin; never leave it beside new input.
function clearRunStatuses() {
  setStatus('run-status', '', 'muted');
  setStatus('export-status', '', 'muted');
}

function rejectFile(name, errors, message) {
  state.loadSeq += 1;
  state.data = null;
  state.report = null;
  state.origin = null;
  clearRunStatuses();
  state.errors = errors;
  setStatus('load-status', `${name}: ${message}`, 'error');
  render();
}

async function importFile(file) {
  if (!file) return;
  setStatus('load-status', `Reading ${file.name} locally…`, 'muted');
  if (file.size > LIMITS.MAX_BYTES) {
    rejectFile(file.name, [{ code: 'INPUT_TOO_LARGE', path: '', message: `File is ${file.size} bytes; the limit is ${LIMITS.MAX_BYTES} bytes (1 MiB).` }], 'rejected before reading (too large).');
    return;
  }
  let text;
  try {
    text = await file.text();
  } catch (error) {
    rejectFile(file.name, [{ code: 'READ_FAILED', path: '', message: String(error?.message || error) }], 'could not be read.');
    return;
  }
  await loadSource(sourceFromLocalFile(file.name, text));
}

function runRules() {
  if (!state.data) return;
  try {
    // A missing origin falls back to the engine default (unverified user-supplied).
    state.report = evaluate(state.data, { origin: state.origin ?? undefined });
    state.selectedId = null;
    const n = state.report.summary.findings;
    setStatus('run-status', runStatusText(state.report), n === 0 ? 'ok' : 'warn');
  } catch (error) {
    state.report = null;
    state.errors = error.errors || [{ code: error.code || 'ENGINE_ERROR', path: '', message: String(error.message) }];
    setStatus('run-status', 'The engine rejected the data; see the errors above.', 'error');
  }
  render();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderErrors() {
  const box = $('errors');
  if (state.errors.length === 0) {
    box.hidden = true;
    box.replaceChildren();
    return;
  }
  box.hidden = false;
  box.replaceChildren(
    el('h3', { text: 'Input rejected' }),
    el('p', { text: 'Atomic validation: no partial results were produced.' }),
    el('ul', {}, formatErrors(state.errors).map((line) => el('li', { class: 'mono', text: line }))),
  );
}

function showOrigin(id, origin) {
  const node = $(id);
  if (!origin) {
    node.hidden = true;
    node.textContent = '';
    delete node.dataset.origin;
    return;
  }
  node.hidden = false;
  node.textContent = originNotice(origin);
  node.dataset.origin = origin;
}

function renderOrigin() {
  showOrigin('source-origin', state.data ? state.origin : null);
  // Results are labelled from the frozen report, not from the current state.
  showOrigin('results-origin', state.report ? state.report.dataOrigin : null);
}

function renderSource() {
  const box = $('source');
  $('run-btn').disabled = !state.data;
  if (!state.data) {
    box.replaceChildren(el('p', { class: 'empty', text: 'No valid input loaded yet.' }));
    return;
  }
  const d = state.data;
  box.replaceChildren(
    table('Episodes', ['id', 'startDate', 'endDate', 'billingDate'], d.episodes.map((e) => [e.id, e.startDate, e.endDate, e.billingDate])),
    table('Documents', ['id', 'episodeId', 'kind', 'signedDate'], d.documents.map((x) => [x.id, x.episodeId, x.kind, x.signedDate === null ? 'null (unsigned)' : x.signedDate])),
    table('Requirements', ['episodeId', 'kind'], d.requirements.map((r) => [r.episodeId, r.kind])),
  );
}

function chip(label, value) {
  return el('div', { class: 'chip' }, [el('span', { class: 'chip-v mono', text: String(value) }), el('span', { class: 'chip-l', text: label })]);
}

function renderSummary() {
  const box = $('summary');
  if (!state.report) {
    box.replaceChildren(el('p', { class: 'empty', text: 'Run the rules to see counts.' }));
    return;
  }
  const s = state.report.summary;
  box.replaceChildren(
    chip('episodes', s.episodes),
    chip('required pairs', s.requiredPairs),
    chip('present pairs', s.presentPairs),
    chip('documents', s.documents),
    chip('findings', s.findings),
    chip('affected episodes', s.affectedEpisodes),
    ...RULE_IDS.map((id) => chip(id, s.countsByRule[id])),
  );
}

function renderTimelines() {
  const box = $('timelines');
  if (!state.report) {
    box.replaceChildren();
    return;
  }
  const strips = state.report.input.episodes.map((episode) => {
    const docs = state.report.input.documents.filter((d) => d.episodeId === episode.id);
    const g = timelineGeometry(episode, docs);
    const track = el('div', { class: 'track', role: 'img', 'aria-label': `${episode.id}: ${formatDate(episode.startDate)} to ${formatDate(episode.endDate)}, billing ${formatDate(episode.billingDate)}${g.billingBeforeStart ? ' (before start)' : ''}` });
    const range = el('div', { class: 'range' });
    range.style.left = `${g.episodeStart}%`;
    range.style.width = `${Math.max(0.5, g.episodeEnd - g.episodeStart)}%`;
    track.append(range);
    const billing = el('div', { class: `billing${g.billingBeforeStart ? ' bad' : ''}`, title: `billing ${episode.billingDate}` });
    billing.style.left = `${g.billing}%`;
    track.append(billing);
    for (const m of g.markers) {
      const dot = el('div', { class: `doc ${m.kind}${m.afterBilling ? ' bad' : ''}${m.signed ? '' : ' unsigned'}`, title: `${m.id} (${m.kind})` });
      if (m.position === null) dot.classList.add('margin');
      else dot.style.left = `${m.position}%`;
      track.append(dot);
    }
    const unsigned = docs.filter((d) => d.signedDate === null).map((d) => d.id);
    return el('div', { class: 'strip' }, [
      el('div', { class: 'strip-head' }, [el('strong', { class: 'mono', text: episode.id }), el('span', { class: 'muted', text: ` ${formatDate(episode.startDate)} – ${formatDate(episode.endDate)} · billing ${formatDate(episode.billingDate)}` })]),
      track,
      unsigned.length ? el('p', { class: 'muted small', text: `Unsigned (drawn in margin): ${unsigned.join(', ')}` }) : null,
    ]);
  });
  box.replaceChildren(
    el('h3', { text: 'Chronology strips (calendar days)' }),
    el('p', { class: 'legend muted small', text: 'Bar = episode span · tick = billing date · dots = signed documents (filled: certification, hollow: carePlan) · red = flagged by HA03/HA04' }),
    ...strips,
  );
}

function renderFindings() {
  const list = $('findings');
  if (!state.report) {
    list.replaceChildren(el('li', { class: 'empty', text: 'No report yet.' }));
    $('filter-count').textContent = '';
    return;
  }
  const shown = filterFindings(state.report.findings, state.filters);
  $('filter-count').textContent = `${shown.length} of ${state.report.findings.length} shown`;
  if (shown.length === 0) {
    list.replaceChildren(el('li', { class: 'empty', text: state.report.findings.length === 0 ? `Zero findings for this input (${originShortLabel(state.report.dataOrigin)}) under the demo rule pack. This is not a clinical, compliance or billing approval.` : 'No findings match the current filters.' }));
    return;
  }
  list.replaceChildren(
    ...shown.map((f) =>
      el('li', {}, [
        el('button', {
          type: 'button',
          class: `finding${f.id === state.selectedId ? ' selected' : ''}`,
          'aria-pressed': f.id === state.selectedId ? 'true' : 'false',
          onclick: () => {
            state.selectedId = f.id;
            renderFindings();
            renderEvidence();
            $('evidence').focus({ preventScroll: false });
          },
        }, [
          el('span', { class: `badge ${f.ruleId}`, text: f.ruleId }),
          el('span', { class: 'mono fid', text: f.id }),
          el('span', { class: 'msg', text: f.message }),
          el('span', { class: 'decision mono', text: state.review.getDecision(f.id) }),
        ]),
      ]),
    ),
  );
}

function renderEvidence() {
  const box = $('evidence');
  const f = state.report?.findings.find((x) => x.id === state.selectedId);
  if (!f) {
    box.replaceChildren(el('p', { class: 'empty', text: 'Open a finding to see its cited input records, rule version and review fields.' }));
    return;
  }
  const extra = Object.fromEntries(Object.entries(f.evidence).filter(([k]) => !['episode', 'document', 'requirement'].includes(k)));
  const rule = RULE_PACK.rules.find((r) => r.id === f.ruleId);
  const noteField = el('textarea', { id: 'note', rows: 3, maxlength: MAX_NOTE_LENGTH, 'aria-describedby': 'note-help' });
  noteField.value = state.review.getNote(f.id);
  const noteStatus = el('p', { id: 'note-help', class: 'muted small', text: `Human review note, up to ${MAX_NOTE_LENGTH} characters. Stored outside the frozen report; included in exports.` });
  noteField.addEventListener('input', () => {
    try {
      state.review.setNote(f.id, noteField.value);
      noteStatus.textContent = `Saved (${noteField.value.length}/${MAX_NOTE_LENGTH}).`;
    } catch (error) {
      noteStatus.textContent = `Not saved: ${error.code}: ${error.message}`;
    }
  });
  const decision = el('select', { id: 'decision' }, DECISIONS.map((d) => el('option', { value: d, text: d, selected: d === state.review.getDecision(f.id) })));
  decision.addEventListener('change', () => {
    state.review.setDecision(f.id, decision.value);
    renderFindings();
  });
  box.replaceChildren(
    el('h3', {}, [el('span', { class: `badge ${f.ruleId}`, text: f.ruleId }), ' ', el('span', { class: 'mono', text: f.id })]),
    el('p', { class: 'title', text: f.title }),
    el('p', { text: f.message }),
    el('p', { class: 'muted small', text: `Rule ${f.ruleId} · rule pack ${f.ruleVersion} (fictional demo contract; no regulatory authority) · ${rule?.description ?? ''}` }),
    kvTable('Cited episode', f.evidence.episode),
    kvTable('Cited document', f.evidence.document),
    kvTable('Cited requirement', f.evidence.requirement),
    Object.keys(extra).length ? kvTable('Computed evidence', extra) : null,
    kvTable('Rule pack provenance', state.report.rulePack.provenance),
    el('div', { class: 'review' }, [
      el('label', { for: 'decision', text: 'Reviewer decision' }),
      decision,
      el('label', { for: 'note', text: 'Reviewer note' }),
      noteField,
      noteStatus,
    ]),
  );
}

function renderExport() {
  const ready = Boolean(state.report);
  $('export-json').disabled = !ready;
  $('export-csv').disabled = !ready;
  $('hash').textContent = ready ? `sourceHash (SHA-256 of the loaded text): ${state.sourceHash ?? 'unavailable in this browser context (exported as null)'}` : '';
}

function render() {
  renderOrigin();
  renderErrors();
  renderSource();
  renderSummary();
  renderTimelines();
  renderFindings();
  renderEvidence();
  renderExport();
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function download(text, type, filename) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(name) {
  return String(name || 'input').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'input';
}

function exportReport(format) {
  try {
    if (!state.report) throw Object.assign(new Error('Run the rules before exporting.'), { code: 'EXPORT_NO_REPORT' });
    const exported = buildExport(state.report, {
      generatedAt: new Date().toISOString(),
      sourceHash: state.sourceHash,
      notes: state.review.notes,
      decisions: state.review.decisions,
    });
    const label = originShortLabel(exported.dataOrigin);
    if (format === 'csv') {
      download(findingsToCsv(state.report, exported.review), 'text/csv;charset=utf-8', `hospiceaudit-${slug(state.sourceName)}-findings.csv`);
      setStatus('export-status', `Exported ${exported.findings.length} finding row(s) as CSV (${label} label in every row).`, 'ok');
    } else {
      download(serializeExport(exported), 'application/json;charset=utf-8', `hospiceaudit-${slug(state.sourceName)}-report.json`);
      setStatus('export-status', `Exported JSON report labelled ${label}: ${exported.findings.length} finding(s), ${Object.keys(exported.review.notes).length} note(s), generated ${exported.generatedAt}.`, 'ok');
    }
  } catch (error) {
    setStatus('export-status', `Export failed: ${error.code || error.name}: ${error.message}`, 'error');
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function init() {
  $('limits').textContent = `Limits: ${LIMITS.MAX_BYTES} bytes, ${LIMITS.MAX_RECORDS} records across all arrays, schemaVersion 1, ruleVersion ${RULE_PACK.ruleVersion}.`;
  const fixtureSelect = $('fixture-select');
  fixtureSelect.replaceChildren(...UI_FIXTURES.map((f) => el('option', { value: f.key, text: f.label })));
  const describe = () => {
    const f = UI_FIXTURES.find((x) => x.key === fixtureSelect.value);
    $('fixture-desc').textContent = f ? f.description : '';
  };
  fixtureSelect.addEventListener('change', describe);
  describe();
  // The bundled-fixture control is the only route to the synthetic origin.
  $('load-fixture').addEventListener('click', () => {
    const source = sourceFromFixture(fixtureSelect.value);
    if (source) loadSource(source);
  });
  $('file').addEventListener('change', (event) => importFile(event.target.files?.[0]));
  $('run-btn').addEventListener('click', runRules);
  $('filter-rule').replaceChildren(el('option', { value: '', text: 'All rules' }), ...RULE_IDS.map((id) => el('option', { value: id, text: id })));
  $('filter-kind').replaceChildren(el('option', { value: '', text: 'All kinds' }), ...KINDS.map((k) => el('option', { value: k, text: k })));
  for (const [id, key] of [['filter-rule', 'ruleId'], ['filter-kind', 'kind'], ['filter-query', 'query']]) {
    $(id).addEventListener('input', () => {
      state.filters[key] = $(id).value;
      renderFindings();
    });
  }
  $('export-json').addEventListener('click', () => exportReport('json'));
  $('export-csv').addEventListener('click', () => exportReport('csv'));
  render();
  setStatus('load-status', 'Nothing loaded. Choose a bundled synthetic fixture or import a local JSON file.', 'muted');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}
