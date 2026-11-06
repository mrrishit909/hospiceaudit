// Pure date-only helpers. Dates are strings "YYYY-MM-DD" and are compared as
// calendar day numbers derived from UTC epoch arithmetic, never through the
// local time zone. Isomorphic: no node: imports.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86400000;

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year, month) {
  const table = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return table[month - 1];
}

/** Returns {year, month, day} for a real calendar date string, otherwise null. */
export function parseDate(value) {
  if (typeof value !== 'string') return null;
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1 || year > 9999) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isValidDate(value) {
  return parseDate(value) !== null;
}

/** Calendar day number (days since 1970-01-01 UTC). Throws on invalid input. */
export function toDayNumber(value) {
  const p = parseDate(value);
  if (!p) throw new TypeError(`Not a valid calendar date: ${String(value)}`);
  const dt = new Date(0);
  // setUTCFullYear avoids the Date.UTC two-digit-year quirk for years < 100.
  dt.setUTCFullYear(p.year, p.month - 1, p.day);
  dt.setUTCHours(0, 0, 0, 0);
  return dt.getTime() / MS_PER_DAY;
}

/** -1, 0 or 1 comparing two valid date strings by calendar day. */
export function compareDates(a, b) {
  const da = toDayNumber(a);
  const db = toDayNumber(b);
  if (da < db) return -1;
  if (da > db) return 1;
  return 0;
}

/** Whole calendar days from a to b (positive when b is later). */
export function daysBetween(a, b) {
  return toDayNumber(b) - toDayNumber(a);
}
