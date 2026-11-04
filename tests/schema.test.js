import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInput, validate, LIMITS, isValidDate, toDayNumber, checkedAdd, OverflowError } from '../src/index.js';
import { GOLDEN, fixtureText } from '../fixtures/index.js';
import { deepClone } from '../src/report.js';

function expectReject(result, code, pathFragment) {
  assert.equal(result.ok, false, 'expected rejection');
  assert.ok(Array.isArray(result.errors) && result.errors.length > 0, 'errors must be listed');
  assert.ok(!('data' in result) && !('report' in result), 'no partial data on rejection');
  const match = result.errors.find((e) => e.code === code);
  assert.ok(match, `expected error code ${code}, got ${result.errors.map((e) => e.code).join(',')}`);
  if (pathFragment !== undefined) assert.ok(match.path.includes(pathFragment), `path ${match.path} should include ${pathFragment}`);
  for (const e of result.errors) {
    assert.equal(typeof e.code, 'string');
    assert.equal(typeof e.path, 'string');
    assert.equal(typeof e.message, 'string');
  }
}

test('schema: golden fixture validates through parseInput', () => {
  const r = parseInput(fixtureText(GOLDEN));
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, GOLDEN);
});

test('schema: non-object roots reject', () => {
  expectReject(parseInput('[]'), 'ROOT_NOT_OBJECT');
  expectReject(parseInput('null'), 'ROOT_NOT_OBJECT');
  expectReject(parseInput('"x"'), 'ROOT_NOT_OBJECT');
  expectReject(parseInput('42'), 'ROOT_NOT_OBJECT');
  expectReject(parseInput(12), 'INPUT_NOT_STRING');
});

test('schema: malformed JSON rejects without throwing', () => {
  expectReject(parseInput('{"schemaVersion":1,'), 'INVALID_JSON');
  expectReject(parseInput(''), 'INVALID_JSON');
});

test('schema: unknown schemaVersion and ruleVersion reject', () => {
  const a = deepClone(GOLDEN);
  a.schemaVersion = 2;
  expectReject(validate(a), 'UNSUPPORTED_SCHEMA_VERSION', 'schemaVersion');
  const b = deepClone(GOLDEN);
  b.schemaVersion = '1';
  expectReject(validate(b), 'UNSUPPORTED_SCHEMA_VERSION');
  const c = deepClone(GOLDEN);
  c.schemaVersion = 1.5;
  expectReject(validate(c), 'UNSUPPORTED_SCHEMA_VERSION');
  const d = deepClone(GOLDEN);
  d.ruleVersion = 'HA-DEMO-2';
  expectReject(validate(d), 'UNSUPPORTED_RULE_VERSION', 'ruleVersion');
  const e = deepClone(GOLDEN);
  delete e.ruleVersion;
  expectReject(validate(e), 'MISSING_KEY', 'ruleVersion');
});

test('schema: unknown and missing keys reject at root and record level', () => {
  const a = deepClone(GOLDEN);
  a.extra = true;
  expectReject(validate(a), 'UNKNOWN_KEY', 'extra');
  const b = deepClone(GOLDEN);
  b.episodes[1].note = 'x';
  expectReject(validate(b), 'UNKNOWN_KEY', 'episodes[1].note');
  const c = deepClone(GOLDEN);
  delete c.documents[3].signedDate;
  expectReject(validate(c), 'MISSING_KEY', 'documents[3].signedDate');
  const d = deepClone(GOLDEN);
  delete d.episodes;
  expectReject(validate(d), 'MISSING_KEY', 'episodes');
});

test('schema: wrong types reject', () => {
  const a = deepClone(GOLDEN);
  a.episodes = {};
  expectReject(validate(a), 'WRONG_TYPE', 'episodes');
  const b = deepClone(GOLDEN);
  b.documents[0].id = 7;
  expectReject(validate(b), 'WRONG_TYPE', 'documents[0].id');
  const c = deepClone(GOLDEN);
  c.episodes[0].startDate = 20260101;
  expectReject(validate(c), 'WRONG_TYPE', 'episodes[0].startDate');
  const d = deepClone(GOLDEN);
  d.requirements[0] = 'EP-1';
  expectReject(validate(d), 'NOT_OBJECT', 'requirements[0]');
  const e = deepClone(GOLDEN);
  e.documents[0].signedDate = false;
  expectReject(validate(e), 'WRONG_TYPE', 'documents[0].signedDate');
});

test('schema: duplicate ids and duplicate requirement pairs reject', () => {
  const a = deepClone(GOLDEN);
  a.episodes[2].id = 'EP-1';
  expectReject(validate(a), 'DUPLICATE_ID', 'episodes[2].id');
  const b = deepClone(GOLDEN);
  b.requirements.push({ episodeId: 'EP-1', kind: 'carePlan' });
  expectReject(validate(b), 'DUPLICATE_REQUIREMENT', 'requirements[6]');
});

test('schema: unresolved references and invalid kinds reject', () => {
  const a = deepClone(GOLDEN);
  a.requirements[0].episodeId = 'EP-9';
  expectReject(validate(a), 'UNRESOLVED_REFERENCE', 'requirements[0].episodeId');
  const b = deepClone(GOLDEN);
  b.documents[0].kind = 'Certification';
  expectReject(validate(b), 'INVALID_KIND', 'documents[0].kind');
  const c = deepClone(GOLDEN);
  c.requirements[0].kind = 'faceToFace';
  expectReject(validate(c), 'INVALID_KIND', 'requirements[0].kind');
});

test('schema: string bounds (empty, over 200 characters)', () => {
  const a = deepClone(GOLDEN);
  a.episodes[0].id = '';
  expectReject(validate(a), 'EMPTY_STRING', 'episodes[0].id');
  const b = deepClone(GOLDEN);
  b.documents[0].id = 'x'.repeat(LIMITS.MAX_ID_LENGTH + 1);
  expectReject(validate(b), 'STRING_TOO_LONG', 'documents[0].id');
  const c = deepClone(GOLDEN);
  c.documents[0].id = 'x'.repeat(LIMITS.MAX_ID_LENGTH);
  assert.equal(validate(c).ok, true, '200 characters is allowed');
});

test('schema: invalid and valid calendar dates, including leap years', () => {
  for (const bad of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-1-01', '2100-02-29', '2026-02-30', '0000-01-01', '2026/01/01', '2026-01-01T00:00:00Z', ' 2026-01-01']) {
    assert.equal(isValidDate(bad), false, `${bad} must be invalid`);
  }
  for (const good of ['2024-02-29', '2000-02-29', '2026-12-31', '0001-01-01', '9999-12-31']) {
    assert.equal(isValidDate(good), true, `${good} must be valid`);
  }
  const a = deepClone(GOLDEN);
  a.episodes[0].billingDate = '2026-02-29';
  expectReject(validate(a), 'INVALID_DATE', 'episodes[0].billingDate');
  const b = deepClone(GOLDEN);
  b.documents[0].signedDate = '2026-04-31';
  expectReject(validate(b), 'INVALID_DATE', 'documents[0].signedDate');
});

test('schema: day numbers are calendar based, not local-time based', () => {
  assert.equal(toDayNumber('1970-01-01'), 0);
  assert.equal(toDayNumber('1970-01-02'), 1);
  assert.equal(toDayNumber('2026-03-01') - toDayNumber('2026-02-28'), 1);
  assert.equal(toDayNumber('2024-03-01') - toDayNumber('2024-02-28'), 2);
  assert.equal(toDayNumber('0099-01-02') - toDayNumber('0099-01-01'), 1);
});

test('schema: startDate after endDate rejects', () => {
  const a = deepClone(GOLDEN);
  a.episodes[0].endDate = '2025-12-31';
  expectReject(validate(a), 'DATE_ORDER', 'episodes[0].endDate');
  const b = deepClone(GOLDEN);
  b.episodes[0].endDate = b.episodes[0].startDate;
  assert.equal(validate(b).ok, true, 'startDate equal to endDate is allowed');
});

test('schema: record limits in one array and across arrays', () => {
  const a = deepClone(GOLDEN);
  a.episodes = [];
  a.documents = [];
  a.requirements = [];
  for (let i = 0; i < LIMITS.MAX_RECORDS + 1; i += 1) {
    a.episodes.push({ id: `E${i}`, startDate: '2026-01-01', endDate: '2026-01-31', billingDate: '2026-02-01' });
  }
  expectReject(validate(a), 'TOO_MANY_RECORDS', 'episodes');
  const b = deepClone(GOLDEN);
  b.episodes = [];
  b.documents = [];
  b.requirements = [];
  for (let i = 0; i < 500; i += 1) {
    b.episodes.push({ id: `E${i}`, startDate: '2026-01-01', endDate: '2026-01-31', billingDate: '2026-02-01' });
  }
  for (let i = 0; i < 501; i += 1) {
    b.documents.push({ id: `D${i}`, episodeId: `E${i % 500}`, kind: 'certification', signedDate: null });
  }
  expectReject(validate(b), 'TOO_MANY_RECORDS');
  b.documents.pop();
  assert.equal(validate(b).ok, true, 'exactly 1000 records across arrays is allowed');
});

test('schema: raw text over 1 MiB (UTF-8) rejects before parsing', () => {
  const big = `{"schemaVersion":1,"pad":"${'x'.repeat(LIMITS.MAX_BYTES)}"}`;
  expectReject(parseInput(big), 'INPUT_TOO_LARGE');
  // Multi-byte characters count by UTF-8 bytes, not string length.
  const multi = `{"pad":"${'é'.repeat(Math.floor(LIMITS.MAX_BYTES / 2) + 10)}"}`;
  assert.ok(multi.length < LIMITS.MAX_BYTES);
  expectReject(parseInput(multi), 'INPUT_TOO_LARGE');
});

test('schema: nesting deeper than 8 rejects', () => {
  const deep = '{"schemaVersion":1,"ruleVersion":"HA-DEMO-1","episodes":[[[[[[[[[]]]]]]]]],"documents":[],"requirements":[]}';
  expectReject(parseInput(deep), 'DEPTH_EXCEEDED');
  const ok = { schemaVersion: 1, ruleVersion: 'HA-DEMO-1', episodes: [], documents: [], requirements: [] };
  assert.equal(validate(ok).ok, true);
});

test('schema: NaN and Infinity reject when validating objects directly', () => {
  const a = deepClone(GOLDEN);
  a.schemaVersion = Number.NaN;
  expectReject(validate(a), 'INVALID_NUMBER');
  const b = deepClone(GOLDEN);
  b.schemaVersion = Number.POSITIVE_INFINITY;
  expectReject(validate(b), 'INVALID_NUMBER');
});

test('schema: errors are collected and bounded; rejection carries no data', () => {
  const a = deepClone(GOLDEN);
  a.episodes[0].id = '';
  a.documents[0].kind = 'nope';
  const r = validate(a);
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 2);
  assert.ok(r.errors.length <= LIMITS.MAX_ERRORS);
  assert.ok(Object.isFrozen(r.errors));
});

test('integers: checkedAdd rejects overflow, negatives and non-integers', () => {
  assert.equal(checkedAdd(1, 2), 3);
  assert.equal(checkedAdd(0, Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  assert.throws(() => checkedAdd(Number.MAX_SAFE_INTEGER, 1), OverflowError);
  assert.throws(() => checkedAdd(1, -1), OverflowError);
  assert.throws(() => checkedAdd(1.5, 1), OverflowError);
  assert.throws(() => checkedAdd(1, Number.NaN), OverflowError);
  try {
    checkedAdd(Number.MAX_SAFE_INTEGER, 1);
  } catch (e) {
    assert.equal(e.code, 'INTEGER_OVERFLOW');
  }
});
