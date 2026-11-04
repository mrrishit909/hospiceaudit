// Checked integer arithmetic. Every counter in the engine goes through
// checkedAdd so an impossible total rejects the whole batch instead of
// silently producing an imprecise number. Isomorphic: no node: imports.

export const OVERFLOW_CODE = 'INTEGER_OVERFLOW';

export class OverflowError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OverflowError';
    this.code = OVERFLOW_CODE;
  }
}

/**
 * Adds b to a only when both are safe integers, b is non-negative, and the
 * sum stays within Number.MAX_SAFE_INTEGER. Otherwise throws OverflowError.
 */
export function checkedAdd(a, b) {
  if (
    !Number.isSafeInteger(a) ||
    !Number.isSafeInteger(b) ||
    b < 0 ||
    b > Number.MAX_SAFE_INTEGER - a
  ) {
    throw new OverflowError(
      `Cannot add ${String(b)} to ${String(a)}: result would leave the safe integer range`,
    );
  }
  return a + b;
}

/** Non-throwing variant returning {ok, value} or {ok:false, code, message}. */
export function tryCheckedAdd(a, b) {
  try {
    return { ok: true, value: checkedAdd(a, b) };
  } catch (error) {
    if (error instanceof OverflowError) {
      return { ok: false, code: error.code, message: error.message };
    }
    throw error;
  }
}

export function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
