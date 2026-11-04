// Report utilities: deep freeze, deep clone, reviewer layer, export, CSV,
// round-trip helpers. Isomorphic: no node: imports. The engine never reads
// the clock or hashes input itself; callers inject generatedAt and sourceHash.

export const SYNTHETIC_LABEL =
  'SYNTHETIC DEMO DATA: fictional records generated for demonstration only. ' +
  'No real patients, providers, claims or identifiers. Fictional rule pack ' +
  'HA-DEMO-1 carries no regulatory, legal or clinical authority.';

export const MAX_NOTE_LENGTH = 2000;
export const DECISIONS = Object.freeze(['open', 'confirmed', 'dismissed', 'escalated']);
export const EXPORT_VERSION = 1;

export class ExportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ExportError';
    this.code = code;
  }
}

export class ReviewError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReviewError';
    this.code = code;
  }
}

export function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return value;
}

/** Clones plain JSON-like data (objects, arrays, primitives). */
export function deepClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => deepClone(v));
  const out = {};
  for (const key of Object.keys(value)) out[key] = deepClone(value[key]);
  return out;
}

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// ---------------------------------------------------------------------------
// Reviewer layer: notes and decisions keyed by finding id, kept entirely
// outside the frozen report.
// ---------------------------------------------------------------------------

export function normalizeNote(text) {
  if (typeof text !== 'string') {
    throw new ReviewError('NOTE_NOT_STRING', 'Reviewer note must be a string');
  }
  if (text.length > MAX_NOTE_LENGTH) {
    throw new ReviewError(
      'NOTE_TOO_LONG',
      `Reviewer note exceeds ${MAX_NOTE_LENGTH} characters (${text.length})`,
    );
  }
  return text;
}

export function normalizeDecision(value) {
  if (!DECISIONS.includes(value)) {
    throw new ReviewError(
      'DECISION_INVALID',
      `Decision must be one of ${DECISIONS.join(', ')}; received ${String(value)}`,
    );
  }
  return value;
}

export class ReviewLayer {
  constructor() {
    this.notes = new Map();
    this.decisions = new Map();
  }

  setNote(findingId, text) {
    if (typeof findingId !== 'string' || findingId.length === 0) {
      throw new ReviewError('FINDING_ID_INVALID', 'Finding id must be a non-empty string');
    }
    const note = normalizeNote(text);
    if (note.length === 0) this.notes.delete(findingId);
    else this.notes.set(findingId, note);
    return this;
  }

  setDecision(findingId, value) {
    if (typeof findingId !== 'string' || findingId.length === 0) {
      throw new ReviewError('FINDING_ID_INVALID', 'Finding id must be a non-empty string');
    }
    this.decisions.set(findingId, normalizeDecision(value));
    return this;
  }

  getNote(findingId) {
    return this.notes.get(findingId) ?? '';
  }

  getDecision(findingId) {
    return this.decisions.get(findingId) ?? 'open';
  }

  toJSON() {
    return {
      notes: Object.fromEntries([...this.notes.entries()].sort()),
      decisions: Object.fromEntries([...this.decisions.entries()].sort()),
    };
  }
}

function toPlainMap(value, label) {
  if (value === undefined || value === null) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  if (isPlainObject(value)) return value;
  throw new ExportError('EXPORT_INVALID_REVIEW', `${label} must be an object or Map keyed by finding id`);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

export function buildExport(report, options = {}) {
  if (
    !report ||
    typeof report !== 'object' ||
    !Array.isArray(report.findings) ||
    !report.summary ||
    typeof report.summary !== 'object' ||
    !report.input
  ) {
    throw new ExportError('EXPORT_INVALID_REPORT', 'Export requires a validated report object');
  }
  const { generatedAt, sourceHash = null, notes, decisions } = options;
  if (typeof generatedAt !== 'string' || !ISO_TIMESTAMP_RE.test(generatedAt)) {
    throw new ExportError(
      'EXPORT_INVALID_TIMESTAMP',
      'generatedAt must be an ISO-8601 UTC timestamp string such as 2026-01-01T00:00:00Z',
    );
  }
  if (sourceHash !== null && !(typeof sourceHash === 'string' && SHA256_HEX_RE.test(sourceHash))) {
    throw new ExportError('EXPORT_INVALID_HASH', 'sourceHash must be null or 64 lowercase hex characters');
  }
  const knownIds = new Set(report.findings.map((f) => f.id));
  const cleanNotes = {};
  for (const [id, text] of Object.entries(toPlainMap(notes, 'notes'))) {
    if (!knownIds.has(id)) {
      throw new ExportError('EXPORT_UNKNOWN_FINDING', `Note refers to unknown finding ${id}`);
    }
    try {
      const note = normalizeNote(text);
      if (note.length > 0) cleanNotes[id] = note;
    } catch (error) {
      throw new ExportError(error.code || 'EXPORT_INVALID_NOTE', error.message);
    }
  }
  const cleanDecisions = {};
  for (const [id, value] of Object.entries(toPlainMap(decisions, 'decisions'))) {
    if (!knownIds.has(id)) {
      throw new ExportError('EXPORT_UNKNOWN_FINDING', `Decision refers to unknown finding ${id}`);
    }
    try {
      cleanDecisions[id] = normalizeDecision(value);
    } catch (error) {
      throw new ExportError(error.code || 'EXPORT_INVALID_DECISION', error.message);
    }
  }
  return {
    exportVersion: EXPORT_VERSION,
    product: 'HospiceAudit',
    syntheticData: true,
    syntheticDataLabel: SYNTHETIC_LABEL,
    schemaVersion: report.schemaVersion,
    ruleVersion: report.ruleVersion,
    rulePack: deepClone(report.rulePack),
    generatedAt,
    sourceHash,
    input: deepClone(report.input),
    summary: deepClone(report.summary),
    findings: deepClone(report.findings),
    review: {
      notes: Object.fromEntries(Object.entries(cleanNotes).sort()),
      decisions: Object.fromEntries(Object.entries(cleanDecisions).sort()),
    },
  };
}

// ASCII-only construction: U+2028/U+2029 are JS line terminators and must not appear literally in source.
const BACKSLASH = String.fromCharCode(92);
const LINE_SEPARATOR_RE = new RegExp(String.fromCharCode(0x2028), "g");
const PARAGRAPH_SEPARATOR_RE = new RegExp(String.fromCharCode(0x2029), "g");

/**
 * Serializes an export as JSON that stays inert when embedded in HTML or a
 * <script> body: "</" becomes "<\/" (so no raw closing tag can appear) and the
 * JavaScript line terminators U+2028/U+2029 are escaped. All three are valid
 * JSON escapes, so JSON.parse recovers the exact original text.
 */
export function serializeExport(exported) {
  return JSON.stringify(exported, null, 2)
    .replace(/<\//g, '<\\/')
    .replace(LINE_SEPARATOR_RE, BACKSLASH + 'u2028')
    .replace(PARAGRAPH_SEPARATOR_RE, BACKSLASH + 'u2029');
}

/** Reparses an export produced by serializeExport and checks its shape. */
export function reparseExport(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ExportError('EXPORT_REPARSE_FAILED', String(error && error.message));
  }
  if (
    !isPlainObject(parsed) ||
    parsed.exportVersion !== EXPORT_VERSION ||
    !Array.isArray(parsed.findings) ||
    !isPlainObject(parsed.summary) ||
    !isPlainObject(parsed.input) ||
    parsed.syntheticData !== true
  ) {
    throw new ExportError('EXPORT_SHAPE_INVALID', 'Reparsed export does not have the expected shape');
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// CSV (RFC 4180 quoting plus formula neutralisation)
// ---------------------------------------------------------------------------

const FORMULA_LEAD_RE = /^[=+\-@\t\r]/;
const NEEDS_QUOTE_RE = /[",\r\n]|^\s|\s$/;

export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (FORMULA_LEAD_RE.test(text)) text = `'${text}`;
  if (NEEDS_QUOTE_RE.test(text) || text.includes("'")) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export const CSV_COLUMNS = Object.freeze([
  'findingId',
  'ruleId',
  'ruleVersion',
  'episodeId',
  'documentId',
  'kind',
  'message',
  'decision',
  'note',
  'syntheticDataLabel',
]);

export function findingsToCsv(report, review = {}) {
  const notes = toPlainMap(review.notes, 'notes');
  const decisions = toPlainMap(review.decisions, 'decisions');
  const lines = [CSV_COLUMNS.map(csvCell).join(',')];
  for (const f of report.findings) {
    lines.push(
      [
        f.id,
        f.ruleId,
        f.ruleVersion,
        f.episodeId,
        f.documentId,
        f.kind,
        f.message,
        decisions[f.id] ?? 'open',
        notes[f.id] ?? '',
        'SYNTHETIC DEMO DATA',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
