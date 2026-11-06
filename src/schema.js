// Strict atomic validation. parseInput(text): size check -> JSON.parse ->
// depth/number walk -> structural validation. Any error means no data is
// returned and no rule runs. Isomorphic: no node: imports (TextEncoder is a
// web-standard global in both Node and browsers).

import { isValidDate, toDayNumber } from './dates.js';
import { checkedAdd, OverflowError } from './integers.js';
import { KINDS, RULE_VERSION, SCHEMA_VERSION } from './rules.js';
import { isPlainObject, deepFreeze } from './report.js';

export const LIMITS = Object.freeze({
  MAX_BYTES: 1024 * 1024, // 1 MiB of UTF-8
  MAX_RECORDS: 1000, // across all arrays and within any one array
  MAX_DEPTH: 8, // nested containers
  MAX_ID_LENGTH: 200, // UTF-16 code units
  MAX_NOTE_LENGTH: 2000,
  MAX_ERRORS: 200, // error list is bounded too
});

export const ROOT_KEYS = Object.freeze(['schemaVersion', 'ruleVersion', 'episodes', 'documents', 'requirements']);
export const ARRAY_KEYS = Object.freeze(['episodes', 'documents', 'requirements']);
export const EPISODE_KEYS = Object.freeze(['id', 'startDate', 'endDate', 'billingDate']);
export const DOCUMENT_KEYS = Object.freeze(['id', 'episodeId', 'kind', 'signedDate']);
export const REQUIREMENT_KEYS = Object.freeze(['episodeId', 'kind']);

export function utf8ByteLength(text) {
  return new TextEncoder().encode(text).length;
}

function fail(errors) {
  return deepFreeze({ ok: false, errors: errors.slice(0, LIMITS.MAX_ERRORS) });
}

function makePusher(errors) {
  return (code, path, message) => {
    if (errors.length < LIMITS.MAX_ERRORS) errors.push({ code, path, message });
  };
}

/** Walks the tree once: rejects non-finite numbers and nesting deeper than MAX_DEPTH. */
export function inspectTree(value, path, depth, push) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) push('INVALID_NUMBER', path, 'Numbers must be finite (no NaN or Infinity)');
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (depth > LIMITS.MAX_DEPTH) {
    push('DEPTH_EXCEEDED', path, `Nesting deeper than ${LIMITS.MAX_DEPTH} levels is not allowed`);
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) inspectTree(value[i], `${path}[${i}]`, depth + 1, push);
    return;
  }
  for (const key of Object.keys(value)) {
    inspectTree(value[key], path ? `${path}.${key}` : key, depth + 1, push);
  }
}

function checkKeys(obj, path, allowed, push) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) push('UNKNOWN_KEY', path ? `${path}.${key}` : key, `Unknown key "${key}"`);
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      push('MISSING_KEY', path ? `${path}.${key}` : key, `Missing required key "${key}"`);
    }
  }
}

function checkIdString(obj, key, path, push) {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return false; // reported by checkKeys
  const value = obj[key];
  const p = `${path}.${key}`;
  if (typeof value !== 'string') {
    push('WRONG_TYPE', p, `"${key}" must be a string`);
    return false;
  }
  if (value.length === 0) {
    push('EMPTY_STRING', p, `"${key}" must not be empty`);
    return false;
  }
  if (value.length > LIMITS.MAX_ID_LENGTH) {
    push('STRING_TOO_LONG', p, `"${key}" exceeds ${LIMITS.MAX_ID_LENGTH} characters`);
    return false;
  }
  return true;
}

function checkDate(obj, key, path, push, nullable) {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return false;
  const value = obj[key];
  const p = `${path}.${key}`;
  if (nullable && value === null) return false; // valid, but not a date
  if (typeof value !== 'string') {
    push('WRONG_TYPE', p, nullable ? `"${key}" must be null or a YYYY-MM-DD string` : `"${key}" must be a YYYY-MM-DD string`);
    return false;
  }
  if (!isValidDate(value)) {
    push('INVALID_DATE', p, `"${value}" is not a real calendar date in YYYY-MM-DD form`);
    return false;
  }
  return true;
}

function checkKind(obj, path, push) {
  if (!Object.prototype.hasOwnProperty.call(obj, 'kind')) return false;
  if (!KINDS.includes(obj.kind)) {
    push('INVALID_KIND', `${path}.kind`, `kind must be one of ${KINDS.join(', ')}`);
    return false;
  }
  return true;
}

function checkReference(obj, path, episodeIds, push) {
  if (!checkIdString(obj, 'episodeId', path, push)) return false;
  if (!episodeIds.has(obj.episodeId)) {
    push('UNRESOLVED_REFERENCE', `${path}.episodeId`, `episodeId "${obj.episodeId}" does not match any episode`);
    return false;
  }
  return true;
}

export function pairKey(episodeId, kind) {
  return JSON.stringify([episodeId, kind]);
}

/** Validates an already-parsed value. Returns {ok:true,data} or {ok:false,errors}. */
export function validate(root) {
  const errors = [];
  const push = makePusher(errors);

  if (!isPlainObject(root)) {
    return fail([{ code: 'ROOT_NOT_OBJECT', path: '', message: 'Root must be a JSON object' }]);
  }
  inspectTree(root, '', 1, push);
  if (errors.length) return fail(errors);

  checkKeys(root, '', ROOT_KEYS, push);
  if (Object.prototype.hasOwnProperty.call(root, 'schemaVersion') && root.schemaVersion !== SCHEMA_VERSION) {
    push('UNSUPPORTED_SCHEMA_VERSION', 'schemaVersion', `Only schemaVersion ${SCHEMA_VERSION} is supported`);
  }
  if (Object.prototype.hasOwnProperty.call(root, 'ruleVersion') && root.ruleVersion !== RULE_VERSION) {
    push('UNSUPPORTED_RULE_VERSION', 'ruleVersion', `Only ruleVersion ${RULE_VERSION} is supported`);
  }
  for (const key of ARRAY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(root, key) && !Array.isArray(root[key])) {
      push('WRONG_TYPE', key, `"${key}" must be an array`);
    }
  }
  if (errors.length) return fail(errors);

  // Record limits with checked arithmetic before touching any row.
  try {
    let total = 0;
    for (const key of ARRAY_KEYS) {
      const n = root[key].length;
      if (n > LIMITS.MAX_RECORDS) push('TOO_MANY_RECORDS', key, `"${key}" has ${n} records; limit is ${LIMITS.MAX_RECORDS}`);
      total = checkedAdd(total, n);
    }
    if (total > LIMITS.MAX_RECORDS) {
      push('TOO_MANY_RECORDS', '', `${total} records across all arrays; limit is ${LIMITS.MAX_RECORDS}`);
    }
  } catch (error) {
    if (error instanceof OverflowError) push(error.code, '', error.message);
    else throw error;
  }
  if (errors.length) return fail(errors);

  // Episodes
  const episodeIds = new Map();
  root.episodes.forEach((ep, i) => {
    const path = `episodes[${i}]`;
    if (!isPlainObject(ep)) {
      push('NOT_OBJECT', path, 'Episode must be an object');
      return;
    }
    checkKeys(ep, path, EPISODE_KEYS, push);
    const idOk = checkIdString(ep, 'id', path, push);
    const startOk = checkDate(ep, 'startDate', path, push, false);
    const endOk = checkDate(ep, 'endDate', path, push, false);
    checkDate(ep, 'billingDate', path, push, false);
    if (startOk && endOk && toDayNumber(ep.startDate) > toDayNumber(ep.endDate)) {
      push('DATE_ORDER', `${path}.endDate`, `endDate ${ep.endDate} is before startDate ${ep.startDate}`);
    }
    if (idOk) {
      if (episodeIds.has(ep.id)) push('DUPLICATE_ID', `${path}.id`, `Duplicate episode id "${ep.id}"`);
      else episodeIds.set(ep.id, i);
    }
  });

  // Documents
  const documentIds = new Map();
  root.documents.forEach((doc, i) => {
    const path = `documents[${i}]`;
    if (!isPlainObject(doc)) {
      push('NOT_OBJECT', path, 'Document must be an object');
      return;
    }
    checkKeys(doc, path, DOCUMENT_KEYS, push);
    const idOk = checkIdString(doc, 'id', path, push);
    checkReference(doc, path, episodeIds, push);
    checkKind(doc, path, push);
    checkDate(doc, 'signedDate', path, push, true);
    if (idOk) {
      if (documentIds.has(doc.id)) push('DUPLICATE_ID', `${path}.id`, `Duplicate document id "${doc.id}"`);
      else documentIds.set(doc.id, i);
    }
  });

  // Requirements
  const pairs = new Set();
  root.requirements.forEach((req, i) => {
    const path = `requirements[${i}]`;
    if (!isPlainObject(req)) {
      push('NOT_OBJECT', path, 'Requirement must be an object');
      return;
    }
    checkKeys(req, path, REQUIREMENT_KEYS, push);
    const refOk = checkReference(req, path, episodeIds, push);
    const kindOk = checkKind(req, path, push);
    if (refOk && kindOk) {
      const key = pairKey(req.episodeId, req.kind);
      if (pairs.has(key)) push('DUPLICATE_REQUIREMENT', path, `Duplicate requirement for ${req.episodeId}/${req.kind}`);
      else pairs.add(key);
    }
  });

  if (errors.length) return fail(errors);
  return { ok: true, data: root };
}

/** Full pipeline from raw text. Never throws for bad input. */
export function parseInput(text) {
  if (typeof text !== 'string') {
    return fail([{ code: 'INPUT_NOT_STRING', path: '', message: 'Input must be a string of JSON text' }]);
  }
  // UTF-8 length is never smaller than UTF-16 length, so this short-circuit is safe.
  if (text.length > LIMITS.MAX_BYTES || utf8ByteLength(text) > LIMITS.MAX_BYTES) {
    return fail([{ code: 'INPUT_TOO_LARGE', path: '', message: `Input exceeds ${LIMITS.MAX_BYTES} bytes (1 MiB)` }]);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return fail([{ code: 'INVALID_JSON', path: '', message: `Invalid JSON: ${String(error && error.message)}` }]);
  }
  return validate(parsed);
}
