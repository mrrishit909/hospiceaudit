// Data-origin provenance. The origin of a report's input is decided by the
// CALLER (which control loaded it), never by anything inside the input. The
// input schema has no provenance field, and no JSON key, marker or label text
// can make data "synthetic". The default for any caller that does not say
// otherwise is the unverified user-supplied origin.

export const DATA_ORIGINS = Object.freeze({
  /** Loaded from this build's bundled fixture registry through the fixture control. */
  BUNDLED_FIXTURE: 'bundled-synthetic-fixture',
  /** Anything else, e.g. a local JSON file chosen by the user. */
  USER_SUPPLIED: 'user-supplied-unverified',
});

export const SYNTHETIC_LABEL =
  'SYNTHETIC DEMO DATA: fictional records generated for demonstration only. ' +
  'No real patients, providers, claims or identifiers. Fictional rule pack ' +
  'HA-DEMO-1 carries no regulatory, legal or clinical authority.';

export const USER_SUPPLIED_LABEL =
  'UNVERIFIED USER-SUPPLIED DATA: records from a local file chosen by the user, ' +
  'not a bundled synthetic fixture. Their origin is unverified. This label does ' +
  'not detect, block or prevent real or patient data, and nothing inside a file ' +
  'can mark it synthetic. Do not load real patient data: privacy, security and ' +
  'legal approval must come first. Fictional rule pack HA-DEMO-1 carries no ' +
  'regulatory, legal or clinical authority.';

/** Short labels used in every CSV row and in UI status lines. */
export const ORIGIN_SHORT_LABELS = Object.freeze({
  [DATA_ORIGINS.BUNDLED_FIXTURE]: 'SYNTHETIC DEMO DATA',
  [DATA_ORIGINS.USER_SUPPLIED]: 'UNVERIFIED USER-SUPPLIED DATA',
});

const FULL_LABELS = Object.freeze({
  [DATA_ORIGINS.BUNDLED_FIXTURE]: SYNTHETIC_LABEL,
  [DATA_ORIGINS.USER_SUPPLIED]: USER_SUPPLIED_LABEL,
});

export class ProvenanceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProvenanceError';
    this.code = code;
  }
}

export function isDataOrigin(value) {
  return value === DATA_ORIGINS.BUNDLED_FIXTURE || value === DATA_ORIGINS.USER_SUPPLIED;
}

/**
 * Report/export provenance fields for an origin. `syntheticData` is true only
 * for the bundled-fixture origin. Unknown origins throw rather than guess.
 */
export function provenanceFields(origin) {
  if (!isDataOrigin(origin)) {
    throw new ProvenanceError('ORIGIN_INVALID', `Unknown data origin: ${String(origin)}`);
  }
  return {
    dataOrigin: origin,
    syntheticData: origin === DATA_ORIGINS.BUNDLED_FIXTURE,
    dataOriginLabel: FULL_LABELS[origin],
  };
}
