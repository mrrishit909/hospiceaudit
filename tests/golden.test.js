import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runValidation, RULE_PACK } from '../src/index.js';
import { GOLDEN, CLEAN, GOLDEN_ORACLE, CLEAN_ORACLE, fixtureText } from '../fixtures/index.js';

test('golden oracle: exactly four findings with the spec ids, in sorted order', () => {
  const r = runValidation(fixtureText(GOLDEN));
  assert.equal(r.ok, true);
  const { report } = r;
  assert.deepEqual(report.findings.map((f) => f.id), GOLDEN_ORACLE.findingIds);
  assert.equal(report.findings.length, 4);
});

test('golden oracle: rule counts 1/1/1/1 and summary 3 / 6 / 5 / 5 / 2', () => {
  const { report } = runValidation(fixtureText(GOLDEN));
  assert.deepEqual(report.summary.countsByRule, GOLDEN_ORACLE.countsByRule);
  assert.equal(report.summary.episodes, GOLDEN_ORACLE.episodes);
  assert.equal(report.summary.requiredPairs, GOLDEN_ORACLE.requiredPairs);
  assert.equal(report.summary.presentPairs, GOLDEN_ORACLE.presentPairs);
  assert.equal(report.summary.documents, GOLDEN_ORACLE.documents);
  assert.equal(report.summary.affectedEpisodes, GOLDEN_ORACLE.affectedEpisodes);
  assert.equal(report.summary.findings, 4);
});

test('golden oracle: HA03 is one calendar day after billing, HA04 one day before start', () => {
  const { report } = runValidation(fixtureText(GOLDEN));
  const ha03 = report.findings.find((f) => f.ruleId === 'HA03');
  const ha04 = report.findings.find((f) => f.ruleId === 'HA04');
  assert.equal(ha03.documentId, 'D-3');
  assert.equal(ha03.evidence.daysAfterBilling, GOLDEN_ORACLE.ha03DaysAfterBilling);
  assert.equal(ha04.episodeId, 'EP-3');
  assert.equal(ha04.evidence.daysBeforeStart, GOLDEN_ORACLE.ha04DaysBeforeStart);
});

test('golden oracle: every finding links to its cited input records and rule version', () => {
  const { report } = runValidation(fixtureText(GOLDEN));
  for (const f of report.findings) {
    assert.equal(f.ruleVersion, 'HA-DEMO-1');
    const episode = report.input.episodes.find((e) => e.id === f.episodeId);
    assert.ok(episode, `episode ${f.episodeId} must exist in the input snapshot`);
    assert.deepEqual(f.evidence.episode, episode);
    if (f.documentId !== null) {
      const doc = report.input.documents.find((d) => d.id === f.documentId);
      assert.deepEqual(f.evidence.document, doc);
    }
    if (f.ruleId === 'HA01') {
      assert.deepEqual(f.evidence.requirement, { episodeId: 'EP-2', kind: 'carePlan' });
      assert.equal(f.evidence.document, null);
    }
  }
  assert.equal(report.rulePack.ruleVersion, RULE_PACK.ruleVersion);
  assert.equal(report.rulePack.provenance.kind, 'fictional-demo-configuration');
});

test('golden oracle: the input snapshot is preserved untouched and no money figure is emitted', () => {
  const { report } = runValidation(fixtureText(GOLDEN));
  assert.deepEqual(report.input, GOLDEN);
  const text = JSON.stringify(report).toLowerCase();
  for (const word of ['exposure', 'cents', 'amount', 'usd', '$']) {
    assert.ok(!text.includes(word), `report must not contain "${word}"`);
  }
  assert.equal(report.syntheticData, true);
  assert.match(report.syntheticDataLabel, /SYNTHETIC DEMO DATA/);
});

test('clean variant: zero findings and six present pairs', () => {
  const r = runValidation(fixtureText(CLEAN));
  assert.equal(r.ok, true);
  assert.equal(r.report.findings.length, CLEAN_ORACLE.findings);
  assert.equal(r.report.summary.presentPairs, CLEAN_ORACLE.presentPairs);
  assert.equal(r.report.summary.requiredPairs, CLEAN_ORACLE.requiredPairs);
  assert.deepEqual(r.report.summary.countsByRule, { HA01: 0, HA02: 0, HA03: 0, HA04: 0 });
  assert.equal(r.report.summary.affectedEpisodes, 0);
  assert.equal(r.report.summary.documents, 6);
});
