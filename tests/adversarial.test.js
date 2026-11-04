import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runValidation, parseInput, LIMITS, buildExport, serializeExport, reparseExport, findingsToCsv } from '../src/index.js';
import { escapeHtml } from '../app/ui.js';
import {
  EMPTY,
  DUPLICATE_DOCUMENT_ID,
  UNRESOLVED_EPISODE,
  END_BEFORE_START,
  INVALID_CALENDAR_DATE,
  SIGNED_ON_BILLING_DATE,
  MISSING_PAIR_ONLY,
  HTML_IN_IDS,
  UNKNOWN_RULE_VERSION,
  UNKNOWN_SCHEMA_VERSION,
  GOLDEN,
  fixtureText,
} from '../fixtures/index.js';
import { deepClone } from '../src/report.js';

function expectRejectedWith(result, code) {
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.code === code), `expected ${code}, got ${result.errors.map((e) => e.code).join(',')}`);
  assert.ok(!('report' in result) && !('data' in result), 'no partial results');
}

test('adversarial 1: empty episodes/documents/requirements -> zero findings and empty state', () => {
  const r = runValidation(fixtureText(EMPTY));
  assert.equal(r.ok, true);
  assert.deepEqual(r.report.findings, []);
  assert.deepEqual(r.report.summary, {
    episodes: 0,
    requiredPairs: 0,
    presentPairs: 0,
    documents: 0,
    findings: 0,
    countsByRule: { HA01: 0, HA02: 0, HA03: 0, HA04: 0 },
    affectedEpisodes: 0,
  });
});

test('adversarial 2: duplicate document id -> schema rejection', () => {
  expectRejectedWith(runValidation(fixtureText(DUPLICATE_DOCUMENT_ID)), 'DUPLICATE_ID');
});

test('adversarial 3: document references nonexistent episode -> schema rejection', () => {
  expectRejectedWith(runValidation(fixtureText(UNRESOLVED_EPISODE)), 'UNRESOLVED_REFERENCE');
});

test('adversarial 4: end before start or invalid calendar date -> schema rejection', () => {
  expectRejectedWith(runValidation(fixtureText(END_BEFORE_START)), 'DATE_ORDER');
  expectRejectedWith(runValidation(fixtureText(INVALID_CALENDAR_DATE)), 'INVALID_DATE');
});

test('adversarial 5: signature exactly on billingDate -> no HA03; calendar day comparison', () => {
  const r = runValidation(fixtureText(SIGNED_ON_BILLING_DATE));
  assert.equal(r.ok, true);
  assert.deepEqual(r.report.findings, []);
  // One day later is HA03, regardless of any time zone the host runs in.
  const later = deepClone(SIGNED_ON_BILLING_DATE);
  later.documents[0].signedDate = '2026-02-02';
  const r2 = runValidation(fixtureText(later));
  assert.deepEqual(r2.report.findings.map((f) => f.id), ['HA03:D-1']);
  assert.equal(r2.report.findings[0].evidence.daysAfterBilling, 1);
});

test('adversarial 6: required pair absent entirely -> one HA01, no invented unsigned/late finding', () => {
  const r = runValidation(fixtureText(MISSING_PAIR_ONLY));
  assert.equal(r.ok, true);
  assert.deepEqual(r.report.findings.map((f) => f.id), ['HA01:EP-1:carePlan']);
  assert.deepEqual(r.report.summary.countsByRule, { HA01: 1, HA02: 0, HA03: 0, HA04: 0 });
  assert.equal(r.report.summary.presentPairs, 1);
  assert.equal(r.report.summary.requiredPairs, 2);
});

test('adversarial 7: HTML in ids and reviewer notes -> escaped rendering and safe serialization', () => {
  const r = runValidation(fixtureText(HTML_IN_IDS));
  assert.equal(r.ok, true);
  const ids = r.report.findings.map((f) => f.id);
  assert.deepEqual(ids, ['HA01:<img src=x onerror=alert(1)>:carePlan', 'HA02:<script>alert("D")</script>']);
  for (const f of r.report.findings) {
    const rendered = escapeHtml(f.message) + escapeHtml(f.id) + escapeHtml(f.episodeId);
    assert.ok(!rendered.includes('<') && !rendered.includes('>'), 'escaped output must contain no angle brackets');
    assert.ok(rendered.includes('&lt;'));
  }
  const note = '<b onmouseover="x()">note</b> & "quotes"';
  const exported = buildExport(r.report, {
    generatedAt: '2026-01-01T00:00:00Z',
    sourceHash: null,
    notes: { [ids[0]]: note },
    decisions: { [ids[0]]: 'escalated' },
  });
  const text = serializeExport(exported);
  const back = reparseExport(text);
  assert.equal(back.review.notes[ids[0]], note, 'note text is preserved exactly in JSON');
  assert.deepEqual(back.findings, r.report.findings);
  assert.ok(!text.includes('</script>'), 'JSON.stringify output must not contain a raw closing script tag');
  const csv = findingsToCsv(r.report, exported.review);
  assert.ok(csv.includes('"HA02:<script>alert(""D"")</script>"'), 'CSV quotes doubled per RFC 4180');
  assert.equal(escapeHtml(note), '&lt;b onmouseover=&quot;x()&quot;&gt;note&lt;/b&gt; &amp; &quot;quotes&quot;');
});

test('adversarial 8: oversize/malformed input, >1,000 records or unknown versions -> rejection without partial results', () => {
  expectRejectedWith(parseInput(`{"schemaVersion":1,"pad":"${'x'.repeat(LIMITS.MAX_BYTES)}"}`), 'INPUT_TOO_LARGE');
  expectRejectedWith(parseInput('{"schemaVersion":1,"ruleVersion":"HA-DEMO-1",'), 'INVALID_JSON');
  const over = deepClone(GOLDEN);
  over.requirements = [];
  over.documents = [];
  over.episodes = [];
  for (let i = 0; i < LIMITS.MAX_RECORDS + 1; i += 1) {
    over.episodes.push({ id: `E${i}`, startDate: '2026-01-01', endDate: '2026-01-31', billingDate: '2026-02-01' });
  }
  expectRejectedWith(runValidation(JSON.stringify(over)), 'TOO_MANY_RECORDS');
  expectRejectedWith(runValidation(fixtureText(UNKNOWN_RULE_VERSION)), 'UNSUPPORTED_RULE_VERSION');
  expectRejectedWith(runValidation(fixtureText(UNKNOWN_SCHEMA_VERSION)), 'UNSUPPORTED_SCHEMA_VERSION');
});
