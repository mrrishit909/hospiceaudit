import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, csvCell, filterFindings, formatDate, timelineGeometry, formatErrors, bufferToHex } from '../app/ui.js';
import { runValidation } from '../src/index.js';
import { GOLDEN, fixtureText } from '../fixtures/index.js';

test('ui: escapeHtml neutralises every dangerous character', () => {
  assert.equal(escapeHtml('<a href="x" onclick=\'y\'>&</a>'), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});

test('ui: csvCell re-export behaves like the engine helper', () => {
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell('a,b'), '"a,b"');
});

test('ui: filterFindings by rule id, kind and entity text', () => {
  const { report } = runValidation(fixtureText(GOLDEN));
  assert.equal(filterFindings(report.findings).length, 4);
  assert.deepEqual(filterFindings(report.findings, { ruleId: 'HA03' }).map((f) => f.id), ['HA03:D-3']);
  assert.deepEqual(filterFindings(report.findings, { query: 'ep-3' }).map((f) => f.id), ['HA02:D-4', 'HA04:EP-3']);
  assert.deepEqual(filterFindings(report.findings, { kind: 'carePlan' }).map((f) => f.id), ['HA01:EP-2:carePlan']);
  assert.deepEqual(filterFindings(report.findings, { ruleId: 'HA01', query: 'D-3' }), []);
  assert.deepEqual(filterFindings(report.findings, { query: '  D-4 ' }).map((f) => f.id), ['HA02:D-4']);
});

test('ui: formatDate is calendar based and handles null', () => {
  assert.equal(formatDate('2026-02-01'), '1 Feb 2026');
  assert.equal(formatDate('2024-02-29'), '29 Feb 2024');
  assert.equal(formatDate(null), 'unsigned');
  assert.equal(formatDate('garbage'), 'garbage');
});

test('ui: timelineGeometry places markers within 0..100 and flags chronology', () => {
  const ep = GOLDEN.episodes.find((e) => e.id === 'EP-3');
  const docs = GOLDEN.documents.filter((d) => d.episodeId === 'EP-3');
  const g = timelineGeometry(ep, docs);
  assert.ok(g.episodeStart >= 0 && g.episodeEnd <= 100 && g.episodeStart < g.episodeEnd);
  assert.ok(g.billing >= 0 && g.billing <= 100);
  assert.equal(g.billingBeforeStart, true);
  assert.equal(g.markers.length, 2);
  const unsigned = g.markers.find((m) => m.id === 'D-4');
  assert.equal(unsigned.signed, false);
  assert.equal(unsigned.position, null);
  const ep2 = GOLDEN.episodes.find((e) => e.id === 'EP-2');
  const g2 = timelineGeometry(ep2, GOLDEN.documents.filter((d) => d.episodeId === 'EP-2'));
  assert.equal(g2.markers[0].afterBilling, true);
  assert.equal(g2.billingBeforeStart, false);
  const g3 = timelineGeometry(ep2, []);
  assert.deepEqual(g3.markers, []);
});

test('ui: formatErrors and bufferToHex', () => {
  assert.deepEqual(formatErrors([{ code: 'X', path: 'a.b', message: 'm' }, { code: 'Y', path: '', message: 'n' }]), ['X at a.b: m', 'Y: n']);
  assert.equal(bufferToHex(new Uint8Array([0, 255, 16]).buffer), '00ff10');
});
