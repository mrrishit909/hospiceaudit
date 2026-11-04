// SYNTHETIC DEMO DATA. Every record here is fictional and exists only to
// exercise the HA-DEMO-1 demonstration rule pack. Single source of truth for
// tests and the workbench UI. All exports are deep-frozen plain data.

import { deepFreeze, deepClone } from '../src/report.js';

export const SYNTHETIC_NOTICE =
  'All fixtures are synthetic demo data: fictional episodes, documents and requirements. No real patients or providers.';

const base = {
  schemaVersion: 1,
  ruleVersion: 'HA-DEMO-1',
  episodes: [
    { id: 'EP-1', startDate: '2026-01-01', endDate: '2026-01-31', billingDate: '2026-02-01' },
    { id: 'EP-2', startDate: '2026-02-01', endDate: '2026-02-28', billingDate: '2026-02-15' },
    { id: 'EP-3', startDate: '2026-03-01', endDate: '2026-03-31', billingDate: '2026-02-28' },
  ],
  documents: [
    { id: 'D-1', episodeId: 'EP-1', kind: 'certification', signedDate: '2026-01-01' },
    { id: 'D-2', episodeId: 'EP-1', kind: 'carePlan', signedDate: '2026-01-02' },
    { id: 'D-3', episodeId: 'EP-2', kind: 'certification', signedDate: '2026-02-16' },
    { id: 'D-4', episodeId: 'EP-3', kind: 'certification', signedDate: null },
    { id: 'D-5', episodeId: 'EP-3', kind: 'carePlan', signedDate: '2026-02-27' },
  ],
  requirements: [
    { episodeId: 'EP-1', kind: 'certification' },
    { episodeId: 'EP-1', kind: 'carePlan' },
    { episodeId: 'EP-2', kind: 'certification' },
    { episodeId: 'EP-2', kind: 'carePlan' },
    { episodeId: 'EP-3', kind: 'certification' },
    { episodeId: 'EP-3', kind: 'carePlan' },
  ],
};

/** Literal golden fixture from the spec: exactly 4 findings. */
export const GOLDEN = deepFreeze(deepClone(base));

/** Clean variant from the spec: zero findings, 6 present pairs. */
export const CLEAN = deepFreeze(
  (() => {
    const d = deepClone(base);
    d.documents.push({ id: 'D-6', episodeId: 'EP-2', kind: 'carePlan', signedDate: '2026-02-02' });
    d.documents.find((x) => x.id === 'D-3').signedDate = '2026-02-15';
    d.documents.find((x) => x.id === 'D-4').signedDate = '2026-03-01';
    d.episodes.find((x) => x.id === 'EP-3').billingDate = '2026-04-01';
    return d;
  })(),
);

/** Adversarial 1: empty arrays -> zero findings and empty state. */
export const EMPTY = deepFreeze({
  schemaVersion: 1,
  ruleVersion: 'HA-DEMO-1',
  episodes: [],
  documents: [],
  requirements: [],
});

/** Adversarial 2: duplicate document id -> schema rejection. */
export const DUPLICATE_DOCUMENT_ID = deepFreeze(
  (() => {
    const d = deepClone(base);
    d.documents.push({ id: 'D-1', episodeId: 'EP-2', kind: 'carePlan', signedDate: '2026-02-02' });
    return d;
  })(),
);

/** Adversarial 3: document references a nonexistent episode -> schema rejection. */
export const UNRESOLVED_EPISODE = deepFreeze(
  (() => {
    const d = deepClone(base);
    d.documents.push({ id: 'D-9', episodeId: 'EP-404', kind: 'carePlan', signedDate: '2026-02-02' });
    return d;
  })(),
);

/** Adversarial 4a: end before start -> schema rejection. */
export const END_BEFORE_START = deepFreeze(
  (() => {
    const d = deepClone(base);
    d.episodes[0].endDate = '2025-12-31';
    return d;
  })(),
);

/** Adversarial 4b: invalid calendar date (2026 is not a leap year) -> schema rejection. */
export const INVALID_CALENDAR_DATE = deepFreeze(
  (() => {
    const d = deepClone(base);
    d.documents[0].signedDate = '2026-02-29';
    return d;
  })(),
);

/** Adversarial 5: signature exactly on billingDate -> no HA03. */
export const SIGNED_ON_BILLING_DATE = deepFreeze({
  schemaVersion: 1,
  ruleVersion: 'HA-DEMO-1',
  episodes: [{ id: 'EP-1', startDate: '2026-01-01', endDate: '2026-01-31', billingDate: '2026-02-01' }],
  documents: [
    { id: 'D-1', episodeId: 'EP-1', kind: 'certification', signedDate: '2026-02-01' },
    { id: 'D-2', episodeId: 'EP-1', kind: 'carePlan', signedDate: '2026-01-15' },
  ],
  requirements: [
    { episodeId: 'EP-1', kind: 'certification' },
    { episodeId: 'EP-1', kind: 'carePlan' },
  ],
});

/** Adversarial 6: required pair absent entirely -> exactly one HA01. */
export const MISSING_PAIR_ONLY = deepFreeze({
  schemaVersion: 1,
  ruleVersion: 'HA-DEMO-1',
  episodes: [{ id: 'EP-1', startDate: '2026-01-01', endDate: '2026-01-31', billingDate: '2026-02-01' }],
  documents: [{ id: 'D-1', episodeId: 'EP-1', kind: 'certification', signedDate: '2026-01-01' }],
  requirements: [
    { episodeId: 'EP-1', kind: 'certification' },
    { episodeId: 'EP-1', kind: 'carePlan' },
  ],
});

/** Adversarial 7: HTML in ids -> must render escaped and serialize safely. */
export const HTML_IN_IDS = deepFreeze({
  schemaVersion: 1,
  ruleVersion: 'HA-DEMO-1',
  episodes: [
    { id: '<img src=x onerror=alert(1)>', startDate: '2026-01-01', endDate: '2026-01-31', billingDate: '2026-02-01' },
  ],
  documents: [
    { id: '<script>alert("D")</script>', episodeId: '<img src=x onerror=alert(1)>', kind: 'certification', signedDate: null },
  ],
  requirements: [
    { episodeId: '<img src=x onerror=alert(1)>', kind: 'certification' },
    { episodeId: '<img src=x onerror=alert(1)>', kind: 'carePlan' },
  ],
});

/** Adversarial 8 (part): unknown rule version -> rejection. */
export const UNKNOWN_RULE_VERSION = deepFreeze(
  (() => {
    const d = deepClone(base);
    d.ruleVersion = 'HA-DEMO-2';
    return d;
  })(),
);

/** Adversarial 8 (part): unknown schema version -> rejection. */
export const UNKNOWN_SCHEMA_VERSION = deepFreeze(
  (() => {
    const d = deepClone(base);
    d.schemaVersion = 2;
    return d;
  })(),
);

/** Named fixtures offered in the workbench. */
export const UI_FIXTURES = deepFreeze([
  { key: 'golden', label: 'Golden (4 findings)', description: 'Spec literal fixture: one finding per rule.', data: GOLDEN },
  { key: 'clean', label: 'Clean (0 findings)', description: 'Spec clean variant: all six pairs present and in order.', data: CLEAN },
  { key: 'empty', label: 'Empty (no records)', description: 'No episodes, documents or requirements.', data: EMPTY },
  { key: 'html', label: 'Hostile ids (HTML)', description: 'Markup inside identifiers; must render as text.', data: HTML_IN_IDS },
]);

export const ALL_FIXTURES = deepFreeze({
  GOLDEN,
  CLEAN,
  EMPTY,
  DUPLICATE_DOCUMENT_ID,
  UNRESOLVED_EPISODE,
  END_BEFORE_START,
  INVALID_CALENDAR_DATE,
  SIGNED_ON_BILLING_DATE,
  MISSING_PAIR_ONLY,
  HTML_IN_IDS,
  UNKNOWN_RULE_VERSION,
  UNKNOWN_SCHEMA_VERSION,
});

/** JSON text for a fixture, as the engine's parseInput expects. */
export function fixtureText(fixture) {
  return JSON.stringify(fixture, null, 2);
}

/** Literal oracle values copied from the spec. */
export const GOLDEN_ORACLE = deepFreeze({
  findingIds: ['HA01:EP-2:carePlan', 'HA02:D-4', 'HA03:D-3', 'HA04:EP-3'],
  countsByRule: { HA01: 1, HA02: 1, HA03: 1, HA04: 1 },
  episodes: 3,
  requiredPairs: 6,
  presentPairs: 5,
  documents: 5,
  affectedEpisodes: 2,
  ha03DaysAfterBilling: 1,
  ha04DaysBeforeStart: 1,
});

export const CLEAN_ORACLE = deepFreeze({ findings: 0, presentPairs: 6, requiredPairs: 6 });
