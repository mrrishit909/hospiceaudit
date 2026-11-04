import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  runValidation,
  ReviewLayer,
  ReviewError,
  ExportError,
  buildExport,
  serializeExport,
  reparseExport,
  findingsToCsv,
  csvCell,
  MAX_NOTE_LENGTH,
  SYNTHETIC_LABEL,
  DATA_ORIGINS,
} from '../src/index.js';
import { GOLDEN, fixtureText } from '../fixtures/index.js';

const TEXT = fixtureText(GOLDEN);
const HASH = createHash('sha256').update(TEXT, 'utf8').digest('hex');

test('notes isolation: adding reviewer notes and decisions leaves validation output byte-identical', () => {
  const before = runValidation(TEXT).report;
  const snapshot = JSON.stringify(before);
  const review = new ReviewLayer();
  review.setNote('HA01:EP-2:carePlan', 'Requested care plan from the synthetic chart.');
  review.setDecision('HA01:EP-2:carePlan', 'escalated');
  review.setNote('HA03:D-3', 'Signature date confirmed by demo reviewer.');
  review.setDecision('HA03:D-3', 'confirmed');
  assert.equal(JSON.stringify(before), snapshot, 'report unchanged after notes');
  const again = runValidation(TEXT).report;
  assert.equal(JSON.stringify(again), snapshot, 're-running validation is byte-identical');
  assert.ok(!JSON.stringify(before).includes('Requested care plan'), 'notes never live inside the frozen report');
  assert.equal(before.findings.length, 4, 'original findings are never removed by a decision');
});

test('review layer: notes are bounded and decisions are constrained', () => {
  const review = new ReviewLayer();
  review.setNote('HA02:D-4', 'x'.repeat(MAX_NOTE_LENGTH));
  assert.equal(review.getNote('HA02:D-4').length, MAX_NOTE_LENGTH);
  assert.throws(() => review.setNote('HA02:D-4', 'x'.repeat(MAX_NOTE_LENGTH + 1)), ReviewError);
  assert.throws(() => review.setNote('HA02:D-4', 42), ReviewError);
  assert.throws(() => review.setDecision('HA02:D-4', 'approved'), ReviewError);
  assert.throws(() => review.setNote('', 'x'), ReviewError);
  assert.equal(review.getDecision('HA02:D-4'), 'open');
  review.setDecision('HA02:D-4', 'dismissed');
  assert.equal(review.getDecision('HA02:D-4'), 'dismissed');
  review.setNote('HA02:D-4', '');
  assert.equal(review.getNote('HA02:D-4'), '');
});

test('export roundtrip: JSON.stringify -> reparse deep-equals live findings and summary', () => {
  const { report } = runValidation(TEXT, { origin: DATA_ORIGINS.BUNDLED_FIXTURE });
  const review = new ReviewLayer();
  review.setNote('HA04:EP-3', 'Billing date typed before episode start in the synthetic feed.');
  review.setDecision('HA04:EP-3', 'confirmed');
  const exported = buildExport(report, {
    generatedAt: '2026-11-04T02:00:00Z',
    sourceHash: HASH,
    notes: review.notes,
    decisions: review.decisions,
  });
  const text = serializeExport(exported);
  const back = reparseExport(text);
  assert.deepEqual(back.findings, report.findings);
  assert.deepEqual(back.summary, report.summary);
  assert.deepEqual(back.input, report.input);
  assert.equal(back.schemaVersion, 1);
  assert.equal(back.ruleVersion, 'HA-DEMO-1');
  assert.equal(back.rulePack.provenance.kind, 'fictional-demo-configuration');
  assert.equal(back.rulePack.provenance.source, 'atlas/docs/specs/HOSPICEAUDIT-VERTICAL-SLICE.md');
  assert.equal(back.exportVersion, 2);
  assert.equal(back.dataOrigin, DATA_ORIGINS.BUNDLED_FIXTURE);
  assert.equal(back.syntheticData, true);
  assert.equal(back.dataOriginLabel, SYNTHETIC_LABEL);
  assert.equal('syntheticDataLabel' in back, false, 'v1 field replaced by dataOriginLabel');
  assert.equal(back.generatedAt, '2026-11-04T02:00:00Z');
  assert.equal(back.sourceHash, HASH);
  assert.match(back.sourceHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(back.review, {
    notes: { 'HA04:EP-3': 'Billing date typed before episode start in the synthetic feed.' },
    decisions: { 'HA04:EP-3': 'confirmed' },
  });
  // Deterministic: same inputs, same bytes.
  assert.equal(serializeExport(buildExport(report, { generatedAt: '2026-11-04T02:00:00Z', sourceHash: HASH, notes: review.notes, decisions: review.decisions })), text);
  // Re-validating the exported input snapshot reproduces the same findings.
  const revalidated = runValidation(JSON.stringify(back.input));
  assert.deepEqual(revalidated.report.findings, report.findings);
});

test('export errors: invalid timestamp, hash, unknown finding, oversize note, bad decision', () => {
  const { report } = runValidation(TEXT);
  assert.throws(() => buildExport(report, {}), (e) => e instanceof ExportError && e.code === 'EXPORT_INVALID_TIMESTAMP');
  assert.throws(() => buildExport(report, { generatedAt: 'yesterday' }), (e) => e.code === 'EXPORT_INVALID_TIMESTAMP');
  assert.throws(() => buildExport(report, { generatedAt: '2026-01-01T00:00:00Z', sourceHash: 'abc' }), (e) => e.code === 'EXPORT_INVALID_HASH');
  assert.throws(() => buildExport(report, { generatedAt: '2026-01-01T00:00:00Z', notes: { nope: 'x' } }), (e) => e.code === 'EXPORT_UNKNOWN_FINDING');
  assert.throws(() => buildExport(report, { generatedAt: '2026-01-01T00:00:00Z', notes: { 'HA02:D-4': 'x'.repeat(MAX_NOTE_LENGTH + 1) } }), (e) => e.code === 'NOTE_TOO_LONG');
  assert.throws(() => buildExport(report, { generatedAt: '2026-01-01T00:00:00Z', decisions: { 'HA02:D-4': 'approved' } }), (e) => e.code === 'DECISION_INVALID');
  assert.throws(() => buildExport({ nope: true }, { generatedAt: '2026-01-01T00:00:00Z' }), (e) => e.code === 'EXPORT_INVALID_REPORT');
  assert.throws(() => reparseExport('{"exportVersion":1}'), (e) => e.code === 'EXPORT_SHAPE_INVALID');
  assert.throws(() => reparseExport('not json'), (e) => e.code === 'EXPORT_REPARSE_FAILED');
});

test('csv: RFC 4180 quoting and formula neutralisation', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell('has,comma'), '"has,comma"');
  assert.equal(csvCell('has "quote"'), '"has ""quote"""');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
  assert.equal(csvCell('=SUM(A1)'), '"\'=SUM(A1)"');
  assert.equal(csvCell('+1'), '"\'+1"');
  assert.equal(csvCell('-1'), '"\'-1"');
  assert.equal(csvCell('@cmd'), '"\'@cmd"');
  assert.equal(csvCell('\tx'), '"\'\tx"');
  assert.equal(csvCell('\rx'), '"\'\rx"');
  const { report } = runValidation(TEXT, { origin: DATA_ORIGINS.BUNDLED_FIXTURE });
  const csv = findingsToCsv(report, { notes: { 'HA02:D-4': '=HYPERLINK("x")' }, decisions: { 'HA02:D-4': 'dismissed' } });
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'findingId,ruleId,ruleVersion,episodeId,documentId,kind,message,decision,note,dataOriginLabel');
  assert.equal(lines.length, 6, 'header + 4 rows + trailing newline');
  const ha02 = lines.find((l) => l.startsWith('HA02:D-4'));
  assert.ok(ha02.includes('"\'=HYPERLINK(""x"")"'));
  assert.ok(ha02.includes(',dismissed,'));
  assert.ok(ha02.endsWith(',SYNTHETIC DEMO DATA'));
});
