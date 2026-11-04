// Versioned, fictional rule pack. This is configuration for a demonstration
// only. It is NOT derived from CMS, Medicare, or any regulatory, legal or
// clinical authority, and claims none. Isomorphic: no node: imports.

import { deepFreeze } from './report.js';

export const RULE_VERSION = 'HA-DEMO-1';
export const SCHEMA_VERSION = 1;
export const KINDS = Object.freeze(['certification', 'carePlan']);

export const RULE_PACK = deepFreeze({
  ruleVersion: RULE_VERSION,
  schemaVersion: SCHEMA_VERSION,
  provenance: {
    kind: 'fictional-demo-configuration',
    statement:
      'HA-DEMO-1 is a fictional, versioned demonstration rule pack. It defines ' +
      'documentation-contract checks for synthetic data only. It is not derived ' +
      'from, and asserts nothing about, CMS or Medicare policy, timing, ' +
      'eligibility, diagnosis, treatment or entitlement. No legal, regulatory ' +
      'or clinical authority is claimed. A qualified hospice compliance expert ' +
      'must review any future authoritative rule pack.',
    source: 'atlas/docs/specs/HOSPICEAUDIT-VERTICAL-SLICE.md',
    syntheticDataOnly: true,
  },
  rules: [
    {
      id: 'HA01',
      title: 'Required document missing',
      description:
        'A required (episode, kind) pair has no document at all. Exactly one ' +
        'finding per missing pair; no unsigned or late finding is invented.',
      cites: ['episode', 'requirement'],
    },
    {
      id: 'HA02',
      title: 'Document unsigned',
      description:
        'An existing document has a null signedDate. A document yields HA02 or ' +
        'HA03, never both.',
      cites: ['episode', 'document'],
    },
    {
      id: 'HA03',
      title: 'Document signed after billing date',
      description:
        'An existing document was signed strictly after its episode’s ' +
        'configured billingDate, compared by calendar day. A signature exactly ' +
        'on the billing date is not a finding.',
      cites: ['episode', 'document'],
    },
    {
      id: 'HA04',
      title: 'Billing date before episode start',
      description:
        'An episode’s billingDate is strictly before its startDate, compared ' +
        'by calendar day.',
      cites: ['episode'],
    },
  ],
});

export const RULE_IDS = Object.freeze(RULE_PACK.rules.map((r) => r.id));

export function ruleById(id) {
  const rule = RULE_PACK.rules.find((r) => r.id === id);
  if (!rule) throw new RangeError(`Unknown rule id ${String(id)}`);
  return rule;
}
