// Pure, testable UI helpers. No DOM access here so node:test can import it.

import { parseDate, toDayNumber } from '../src/dates.js';
import { DATA_ORIGINS, ORIGIN_SHORT_LABELS, provenanceFields } from '../src/provenance.js';
import { UI_FIXTURES, fixtureText } from '../fixtures/index.js';
export { csvCell } from '../src/report.js';

// ---------------------------------------------------------------------------
// Data origin. The origin is decided by WHICH control loaded the data, never
// by the data: a bundled fixture key is the only route to the synthetic
// origin, and every local file is unverified whatever its name or content.
// ---------------------------------------------------------------------------

/** Source for the bundled-fixture control, or null if the key is not bundled. */
export function sourceFromFixture(key) {
  const fixture = UI_FIXTURES.find((f) => f.key === key);
  if (!fixture) return null;
  return { name: `fixture:${fixture.key}`, text: fixtureText(fixture.data), origin: DATA_ORIGINS.BUNDLED_FIXTURE };
}

/** Source for a local file the user chose. Always unverified user-supplied. */
export function sourceFromLocalFile(name, text) {
  return { name: String(name), text, origin: DATA_ORIGINS.USER_SUPPLIED };
}

/** Short label ("SYNTHETIC DEMO DATA" / "UNVERIFIED USER-SUPPLIED DATA") for an origin. */
export function originShortLabel(origin) {
  return ORIGIN_SHORT_LABELS[provenanceFields(origin).dataOrigin];
}

/** Full warning/label text for an origin. */
export function originNotice(origin) {
  return provenanceFields(origin).dataOriginLabel;
}

/** Status line after the rules run; the label comes from the report itself. */
export function runStatusText(report) {
  const label = originShortLabel(report.dataOrigin);
  const n = report.summary.findings;
  return n === 0
    ? `Rules ran on ${label}: zero findings under ${report.ruleVersion}. Not a clinical, compliance or billing approval.`
    : `Rules ran on ${label}: ${n} finding(s) under ${report.ruleVersion}.`;
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-02-01" -> "1 Feb 2026"; null -> "unsigned"; anything else returned as text. */
export function formatDate(value) {
  if (value === null) return 'unsigned';
  const p = parseDate(value);
  if (!p) return String(value);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/**
 * Filters findings by rule id, kind, and a case-insensitive entity text query
 * matched against finding id, episode id, document id and message.
 */
export function filterFindings(findings, { ruleId = '', kind = '', query = '' } = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  return findings.filter((f) => {
    if (ruleId && f.ruleId !== ruleId) return false;
    if (kind && f.kind !== kind) return false;
    if (!q) return true;
    return [f.id, f.episodeId, f.documentId ?? '', f.message].some((v) => String(v).toLowerCase().includes(q));
  });
}

/**
 * Timeline geometry for one episode strip, in percentages of the strip width.
 * Documents without a signature get position null (drawn in the margin).
 */
export function timelineGeometry(episode, documents) {
  const start = toDayNumber(episode.startDate);
  const end = toDayNumber(episode.endDate);
  const billing = toDayNumber(episode.billingDate);
  const signed = documents.filter((d) => d.signedDate !== null).map((d) => toDayNumber(d.signedDate));
  const lo = Math.min(start, billing, ...signed);
  const hi = Math.max(end, billing, ...signed);
  const pad = Math.max(2, Math.round((hi - lo) * 0.08));
  const min = lo - pad;
  const span = Math.max(1, hi + pad - min);
  const pct = (day) => Math.round(((day - min) / span) * 1000) / 10;
  return {
    episodeStart: pct(start),
    episodeEnd: pct(end),
    billing: pct(billing),
    billingBeforeStart: billing < start,
    markers: documents.map((d) => ({
      id: d.id,
      kind: d.kind,
      signed: d.signedDate !== null,
      position: d.signedDate === null ? null : pct(toDayNumber(d.signedDate)),
      afterBilling: d.signedDate !== null && toDayNumber(d.signedDate) > billing,
    })),
  };
}

/** Human-readable lines for a validation error list. */
export function formatErrors(errors) {
  return errors.map((e) => `${e.code}${e.path ? ` at ${e.path}` : ''}: ${e.message}`);
}

/** Lowercase hex from an ArrayBuffer (for crypto.subtle digests). */
export function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}
