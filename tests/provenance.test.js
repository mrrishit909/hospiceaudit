import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseInput,
  evaluate,
  runValidation,
  buildExport,
  serializeExport,
  reparseExport,
  findingsToCsv,
  DATA_ORIGINS,
  SYNTHETIC_LABEL,
  USER_SUPPLIED_LABEL,
  EXPORT_VERSION,
  ProvenanceError,
} from '../src/index.js';
import { GOLDEN, fixtureText } from '../fixtures/index.js';
import { sourceFromFixture, sourceFromLocalFile, runStatusText, originShortLabel, originNotice } from '../app/ui.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AT = '2026-11-04T02:00:00Z';

// Mirrors app.js: a source (from a control) -> parseInput -> evaluate with the source's origin.
function runSource(source) {
  const parsed = parseInput(source.text);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
  return evaluate(parsed.data, { origin: source.origin });
}

function csvLabels(report) {
  const lines = findingsToCsv(report).split('\r\n').filter(Boolean);
  assert.equal(lines[0].split(',').at(-1), 'dataOriginLabel');
  return lines.slice(1).map((l) => l.split(',').at(-1));
}

const ARBITRARY = {
  schemaVersion: 1,
  ruleVersion: 'HA-DEMO-1',
  episodes: [{ id: 'X-1', startDate: '2026-05-01', endDate: '2026-05-31', billingDate: '2026-04-30' }],
  documents: [{ id: 'X-D1', episodeId: 'X-1', kind: 'certification', signedDate: null }],
  requirements: [{ episodeId: 'X-1', kind: 'certification' }, { episodeId: 'X-1', kind: 'carePlan' }],
};

test('provenance: bundled-fixture control yields SYNTHETIC DEMO DATA in report, JSON and every CSV row', () => {
  const source = sourceFromFixture('golden');
  assert.equal(source.origin, DATA_ORIGINS.BUNDLED_FIXTURE);
  const report = runSource(source);
  assert.equal(report.dataOrigin, DATA_ORIGINS.BUNDLED_FIXTURE);
  assert.equal(report.syntheticData, true);
  assert.equal(report.dataOriginLabel, SYNTHETIC_LABEL);
  const back = reparseExport(serializeExport(buildExport(report, { generatedAt: AT })));
  assert.equal(back.exportVersion, EXPORT_VERSION);
  assert.equal(back.dataOrigin, DATA_ORIGINS.BUNDLED_FIXTURE);
  assert.equal(back.syntheticData, true);
  assert.equal(back.dataOriginLabel, SYNTHETIC_LABEL);
  const labels = csvLabels(report);
  assert.equal(labels.length, 4);
  assert.ok(labels.every((l) => l === 'SYNTHETIC DEMO DATA'));
  assert.match(runStatusText(report), /^Rules ran on SYNTHETIC DEMO DATA: 4 finding\(s\)/);
});

test('provenance: an arbitrary local JSON file yields UNVERIFIED USER-SUPPLIED DATA everywhere', () => {
  const report = runSource(sourceFromLocalFile('episodes.json', JSON.stringify(ARBITRARY)));
  assert.equal(report.dataOrigin, DATA_ORIGINS.USER_SUPPLIED);
  assert.equal(report.syntheticData, false);
  assert.equal(report.dataOriginLabel, USER_SUPPLIED_LABEL);
  assert.ok(report.findings.length > 0);
  const exported = buildExport(report, { generatedAt: AT });
  const text = serializeExport(exported);
  const back = reparseExport(text);
  assert.equal(back.dataOrigin, DATA_ORIGINS.USER_SUPPLIED);
  assert.equal(back.syntheticData, false);
  assert.match(back.dataOriginLabel, /^UNVERIFIED USER-SUPPLIED DATA/);
  assert.match(back.dataOriginLabel, /origin is unverified/);
  assert.match(back.dataOriginLabel, /does not detect, block or prevent real or patient data/);
  assert.ok(!text.includes('SYNTHETIC DEMO DATA'), 'no synthetic label anywhere in the JSON export');
  const labels = csvLabels(report);
  assert.equal(labels.length, report.findings.length);
  assert.ok(labels.every((l) => l === 'UNVERIFIED USER-SUPPLIED DATA'));
  assert.ok(!findingsToCsv(report).includes('SYNTHETIC'), 'no synthetic label anywhere in the CSV export');
  assert.match(runStatusText(report), /^Rules ran on UNVERIFIED USER-SUPPLIED DATA: /);
  assert.equal(originShortLabel(report.dataOrigin), 'UNVERIFIED USER-SUPPLIED DATA');
  assert.equal(originNotice(report.dataOrigin), USER_SUPPLIED_LABEL);
});

test('provenance: a local file byte-identical to a bundled fixture is still unverified', () => {
  const fixture = sourceFromFixture('golden');
  const file = sourceFromLocalFile('golden.json', fixtureText(GOLDEN));
  assert.equal(file.text, fixture.text);
  const fromFile = runSource(file);
  const fromFixture = runSource(fixture);
  assert.equal(fromFile.dataOrigin, DATA_ORIGINS.USER_SUPPLIED);
  assert.equal(fromFile.syntheticData, false);
  assert.deepEqual(fromFile.findings, fromFixture.findings, 'origin never changes findings');
  assert.deepEqual(fromFile.summary, fromFixture.summary);
  // The same goes for a file named like a fixture source.
  assert.equal(sourceFromLocalFile('fixture:golden', fixture.text).origin, DATA_ORIGINS.USER_SUPPLIED);
});

test('self-assertion: provenance markers inside the JSON are rejected or ignored, never trusted', () => {
  for (const marker of [
    { syntheticData: true },
    { dataOrigin: DATA_ORIGINS.BUNDLED_FIXTURE },
    { dataOriginLabel: SYNTHETIC_LABEL },
    { syntheticDataLabel: SYNTHETIC_LABEL },
  ]) {
    const text = JSON.stringify({ ...ARBITRARY, ...marker });
    const parsed = parseInput(sourceFromLocalFile('claims-synthetic.json', text).text);
    assert.equal(parsed.ok, false, `marker ${Object.keys(marker)[0]} must not be accepted`);
    assert.ok(parsed.errors.some((e) => e.code === 'UNKNOWN_KEY'));
    assert.equal(runValidation(text).ok, false, 'no partial report');
  }
  // Marker text inside accepted values changes nothing.
  const sneaky = JSON.parse(JSON.stringify(ARBITRARY));
  sneaky.episodes[0].id = 'SYNTHETIC DEMO DATA';
  sneaky.documents[0].episodeId = 'SYNTHETIC DEMO DATA';
  sneaky.requirements.forEach((r) => { r.episodeId = 'SYNTHETIC DEMO DATA'; });
  sneaky.documents[0].id = 'bundled-synthetic-fixture';
  const report = runSource(sourceFromLocalFile('SYNTHETIC DEMO DATA.json', JSON.stringify(sneaky)));
  assert.equal(report.dataOrigin, DATA_ORIGINS.USER_SUPPLIED);
  assert.equal(report.syntheticData, false);
  assert.ok(csvLabels(report).every((l) => l === 'UNVERIFIED USER-SUPPLIED DATA'));
});

test('self-assertion: export options and legacy report flags cannot raise provenance', () => {
  const report = runSource(sourceFromLocalFile('x.json', JSON.stringify(ARBITRARY)));
  const exported = buildExport(report, {
    generatedAt: AT,
    syntheticData: true,
    dataOrigin: DATA_ORIGINS.BUNDLED_FIXTURE,
    dataOriginLabel: SYNTHETIC_LABEL,
  });
  assert.equal(exported.dataOrigin, DATA_ORIGINS.USER_SUPPLIED);
  assert.equal(exported.syntheticData, false);
  // A report object without dataOrigin (v1-era shape claiming syntheticData) is treated as unverified.
  const { dataOrigin, dataOriginLabel, ...rest } = report;
  const legacyShaped = { ...rest, syntheticData: true, syntheticDataLabel: SYNTHETIC_LABEL };
  assert.equal(buildExport(legacyShaped, { generatedAt: AT }).dataOrigin, DATA_ORIGINS.USER_SUPPLIED);
  assert.ok(csvLabels(legacyShaped).every((l) => l === 'UNVERIFIED USER-SUPPLIED DATA'));
  assert.throws(() => buildExport({ ...report, dataOrigin: 'trust-me' }, { generatedAt: AT }), (e) => e.code === 'EXPORT_INVALID_ORIGIN');
});

test('self-assertion: a hand-edited v2 export whose flag contradicts its origin is rejected', () => {
  const report = runSource(sourceFromLocalFile('x.json', JSON.stringify(ARBITRARY)));
  const good = buildExport(report, { generatedAt: AT });
  const flipped = { ...good, syntheticData: true };
  assert.throws(() => reparseExport(JSON.stringify(flipped)), (e) => e.code === 'EXPORT_SHAPE_INVALID');
  const relabelled = { ...good, dataOriginLabel: SYNTHETIC_LABEL };
  assert.throws(() => reparseExport(JSON.stringify(relabelled)), (e) => e.code === 'EXPORT_SHAPE_INVALID');
  const unknown = { ...good, dataOrigin: 'verified-synthetic' };
  assert.throws(() => reparseExport(JSON.stringify(unknown)), (e) => e.code === 'EXPORT_SHAPE_INVALID');
});

test('origins: only bundled fixture keys reach the synthetic origin; unknown origins throw', () => {
  for (const key of ['', 'nope', '__proto__', 'constructor', 'GOLDEN', 'golden ']) {
    assert.equal(sourceFromFixture(key), null, `key ${JSON.stringify(key)}`);
  }
  assert.equal(evaluate(GOLDEN).dataOrigin, DATA_ORIGINS.USER_SUPPLIED, 'default is unverified');
  for (const origin of [true, 'synthetic', null, 'SYNTHETIC DEMO DATA']) {
    assert.throws(() => evaluate(GOLDEN, { origin }), (e) => e instanceof ProvenanceError && e.code === 'ORIGIN_INVALID');
  }
});

test('compatibility: v1 exports still reparse; other versions do not', () => {
  const report = runSource(sourceFromFixture('golden'));
  const v2 = buildExport(report, { generatedAt: AT });
  const { dataOrigin, dataOriginLabel, ...common } = v2;
  const v1 = { ...common, exportVersion: 1, syntheticData: true, syntheticDataLabel: SYNTHETIC_LABEL };
  const back = reparseExport(serializeExport(v1));
  assert.equal(back.exportVersion, 1);
  assert.deepEqual(back.findings, report.findings);
  assert.throws(() => reparseExport(JSON.stringify({ ...v1, syntheticData: false })), (e) => e.code === 'EXPORT_SHAPE_INVALID');
  assert.throws(() => reparseExport(JSON.stringify({ ...v2, exportVersion: 3 })), (e) => e.code === 'EXPORT_SHAPE_INVALID');
});

test('workbench wiring: origin comes only from the two source helpers; file reading stays local', () => {
  const app = readFileSync(join(ROOT, 'app', 'app.js'), 'utf8');
  assert.match(app, /loadSource\(sourceFromLocalFile\(file\.name, text\)\)/, 'file import uses the unverified source');
  assert.match(app, /sourceFromFixture\(fixtureSelect\.value\)/, 'fixture control uses the bundled source');
  assert.ok(!app.includes('BUNDLED_FIXTURE') && !app.includes('bundled-synthetic-fixture'), 'app.js never names the synthetic origin itself');
  assert.ok(!app.includes('SYNTHETIC_LABEL'), 'app.js never applies the synthetic label directly');
  assert.match(app, /async function loadSource\([^)]*\) \{[^}]*clearRunStatuses\(\);/, 'a new load clears the previous run/export status');
  // The "not uploaded" copy is only true while shipped code has no network API.
  const NETWORK = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|RTCPeerConnection|\.submit\s*\(/;
  for (const dir of ['app', 'src', 'fixtures']) {
    for (const name of readdirSync(join(ROOT, dir)).filter((n) => /\.(m?js|html)$/.test(n))) {
      assert.ok(!NETWORK.test(readFileSync(join(ROOT, dir, name), 'utf8')), `${dir}/${name} must not use network APIs`);
    }
  }
  const html = readFileSync(join(ROOT, 'app', 'index.html'), 'utf8');
  assert.ok(!/\bupload(ed|ing|s)?\b/i.test(html.replace(/is not uploaded/g, '')), 'no copy calls local selection an upload');
  assert.match(html, /UNVERIFIED USER-SUPPLIED DATA/);
  assert.match(html, /does not detect or prevent real or patient data/);
  assert.match(html, /id="results-origin"/);
});
