import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runValidation, evaluate } from '../src/index.js';
import { GOLDEN, fixtureText } from '../fixtures/index.js';
import { deepClone } from '../src/report.js';

// Deterministic PRNG so the shuffle is reproducible in failures.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(array, rand) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

test('determinism: shuffling input array order does not change findings or summary', () => {
  const baseline = runValidation(fixtureText(GOLDEN)).report;
  for (let seed = 1; seed <= 25; seed += 1) {
    const rand = mulberry32(seed);
    const shuffled = deepClone(GOLDEN);
    shuffled.episodes = shuffle(shuffled.episodes, rand);
    shuffled.documents = shuffle(shuffled.documents, rand);
    shuffled.requirements = shuffle(shuffled.requirements, rand);
    const r = runValidation(JSON.stringify(shuffled));
    assert.equal(r.ok, true);
    assert.equal(JSON.stringify(r.report.findings), JSON.stringify(baseline.findings), `seed ${seed}`);
    assert.equal(JSON.stringify(r.report.summary), JSON.stringify(baseline.summary), `seed ${seed}`);
    // The snapshot preserves the caller's order, so it may differ; records must match as a set.
    assert.deepEqual([...r.report.input.documents].sort((a, b) => (a.id < b.id ? -1 : 1)), [...GOLDEN.documents].sort((a, b) => (a.id < b.id ? -1 : 1)));
  }
});

test('determinism: running twice yields byte-identical reports with stable finding ids', () => {
  const a = runValidation(fixtureText(GOLDEN)).report;
  const b = runValidation(fixtureText(GOLDEN)).report;
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(a.findings.map((f) => f.id), ['HA01:EP-2:carePlan', 'HA02:D-4', 'HA03:D-3', 'HA04:EP-3']);
});

test('determinism: findings are sorted by rule id then entity ids using code-unit order', () => {
  const data = deepClone(GOLDEN);
  data.episodes.push({ id: 'EP-10', startDate: '2026-05-01', endDate: '2026-05-31', billingDate: '2026-06-01' });
  data.requirements.push({ episodeId: 'EP-10', kind: 'carePlan' }, { episodeId: 'EP-10', kind: 'certification' });
  data.documents.push({ id: 'D-10', episodeId: 'EP-1', kind: 'certification', signedDate: null });
  const { report } = runValidation(JSON.stringify(data));
  assert.deepEqual(
    report.findings.map((f) => f.id),
    ['HA01:EP-10:carePlan', 'HA01:EP-10:certification', 'HA01:EP-2:carePlan', 'HA02:D-10', 'HA02:D-4', 'HA03:D-3', 'HA04:EP-3'],
  );
  // Multiple documents for one pair: distinct pairs are counted once; each document still evaluated.
  assert.equal(report.summary.presentPairs, 5);
  assert.equal(report.summary.documents, 6);
});

test('immutability: the report is deep-frozen and mutation attempts throw in strict mode', () => {
  const { report } = runValidation(fixtureText(GOLDEN));
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.findings));
  assert.ok(Object.isFrozen(report.findings[0]));
  assert.ok(Object.isFrozen(report.findings[0].evidence.episode));
  assert.ok(Object.isFrozen(report.summary.countsByRule));
  assert.ok(Object.isFrozen(report.input.episodes[0]));
  assert.throws(() => {
    report.findings.push({ id: 'fake' });
  }, TypeError);
  assert.throws(() => {
    report.summary.episodes = 99;
  }, TypeError);
  assert.throws(() => {
    report.findings[0].message = 'tampered';
  }, TypeError);
  assert.throws(() => {
    delete report.input.episodes[0].id;
  }, TypeError);
  assert.throws(() => {
    report.extra = true;
  }, TypeError);
});

test('immutability: evaluate does not freeze or alias the caller’s data', () => {
  const data = deepClone(GOLDEN);
  const report = evaluate(data);
  assert.ok(!Object.isFrozen(data));
  assert.notEqual(report.input, data);
  data.episodes[0].id = 'CHANGED';
  assert.equal(report.input.episodes[0].id, 'EP-1');
});

test('evaluate throws a coded error on invalid data instead of producing a partial report', () => {
  const bad = deepClone(GOLDEN);
  bad.documents[0].kind = 'nope';
  assert.throws(() => evaluate(bad), (e) => e.code === 'INVALID_DATA' && Array.isArray(e.errors));
});
