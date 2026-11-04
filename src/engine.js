// Rule engine for HA-DEMO-1. Runs only on validated data, produces a
// deterministic, deep-frozen report. Isomorphic: no node: imports.

import { toDayNumber } from './dates.js';
import { checkedAdd } from './integers.js';
import { parseInput, validate, pairKey } from './schema.js';
import { RULE_PACK, RULE_IDS, RULE_VERSION, SCHEMA_VERSION, ruleById } from './rules.js';
import { deepClone, deepFreeze, SYNTHETIC_LABEL } from './report.js';

function makeFinding({ ruleId, episode, document = null, requirement = null, details = {} }) {
  const rule = ruleById(ruleId);
  let entityIds;
  let message;
  if (ruleId === 'HA01') {
    entityIds = [episode.id, requirement.kind];
    message = `Episode ${episode.id} requires a ${requirement.kind} document but none exists.`;
  } else if (ruleId === 'HA02') {
    entityIds = [document.id];
    message = `Document ${document.id} (${document.kind} for episode ${episode.id}) has no signature date.`;
  } else if (ruleId === 'HA03') {
    entityIds = [document.id];
    message =
      `Document ${document.id} (${document.kind}) was signed on ${document.signedDate}, ` +
      `${details.daysAfterBilling} calendar day(s) after episode ${episode.id} billing date ${episode.billingDate}.`;
  } else {
    entityIds = [episode.id];
    message =
      `Episode ${episode.id} billing date ${episode.billingDate} is ` +
      `${details.daysBeforeStart} calendar day(s) before its start date ${episode.startDate}.`;
  }
  return {
    id: `${ruleId}:${entityIds.join(':')}`,
    ruleId,
    ruleVersion: RULE_VERSION,
    title: rule.title,
    message,
    episodeId: episode.id,
    documentId: document ? document.id : null,
    kind: document ? document.kind : requirement ? requirement.kind : null,
    entityIds,
    evidence: {
      episode: deepClone(episode),
      document: document ? deepClone(document) : null,
      requirement: requirement ? deepClone(requirement) : null,
      ...details,
    },
  };
}

function compareStrings(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function compareFindings(a, b) {
  const byRule = compareStrings(a.ruleId, b.ruleId);
  if (byRule !== 0) return byRule;
  const n = Math.max(a.entityIds.length, b.entityIds.length);
  for (let i = 0; i < n; i += 1) {
    const c = compareStrings(a.entityIds[i] ?? '', b.entityIds[i] ?? '');
    if (c !== 0) return c;
  }
  return 0;
}

/**
 * Evaluates validated data and returns a deep-frozen report. Throws if the
 * data does not validate (callers should use runValidation for raw text).
 */
export function evaluate(data) {
  const checked = validate(data);
  if (!checked.ok) {
    const error = new Error('evaluate() requires validated data');
    error.code = 'INVALID_DATA';
    error.errors = checked.errors;
    throw error;
  }
  const input = deepClone(checked.data);
  const episodesById = new Map(input.episodes.map((ep) => [ep.id, ep]));
  const docsByPair = new Map();
  for (const doc of input.documents) {
    const key = pairKey(doc.episodeId, doc.kind);
    if (!docsByPair.has(key)) docsByPair.set(key, []);
    docsByPair.get(key).push(doc);
  }

  const findings = [];

  // HA04: billing before start (episode level)
  for (const episode of input.episodes) {
    const billing = toDayNumber(episode.billingDate);
    const start = toDayNumber(episode.startDate);
    if (billing < start) {
      findings.push(makeFinding({ ruleId: 'HA04', episode, details: { daysBeforeStart: start - billing } }));
    }
  }

  // HA01: required pair with no document at all
  let presentPairs = 0;
  for (const requirement of input.requirements) {
    const episode = episodesById.get(requirement.episodeId);
    if (docsByPair.has(pairKey(requirement.episodeId, requirement.kind))) {
      presentPairs = checkedAdd(presentPairs, 1);
    } else {
      findings.push(makeFinding({ ruleId: 'HA01', episode, requirement }));
    }
  }

  // HA02 / HA03: each document yields at most one of them
  for (const document of input.documents) {
    const episode = episodesById.get(document.episodeId);
    if (document.signedDate === null) {
      findings.push(makeFinding({ ruleId: 'HA02', episode, document }));
      continue;
    }
    const signed = toDayNumber(document.signedDate);
    const billing = toDayNumber(episode.billingDate);
    if (signed > billing) {
      findings.push(
        makeFinding({ ruleId: 'HA03', episode, document, details: { daysAfterBilling: signed - billing } }),
      );
    }
  }

  findings.sort(compareFindings);

  const countsByRule = {};
  for (const id of RULE_IDS) countsByRule[id] = 0;
  const affected = new Set();
  let total = 0;
  for (const finding of findings) {
    countsByRule[finding.ruleId] = checkedAdd(countsByRule[finding.ruleId], 1);
    total = checkedAdd(total, 1);
    affected.add(finding.episodeId);
  }

  const summary = {
    episodes: checkedAdd(0, input.episodes.length),
    requiredPairs: checkedAdd(0, input.requirements.length),
    presentPairs,
    documents: checkedAdd(0, input.documents.length),
    findings: total,
    countsByRule,
    affectedEpisodes: checkedAdd(0, affected.size),
  };

  return deepFreeze({
    schemaVersion: SCHEMA_VERSION,
    ruleVersion: RULE_VERSION,
    rulePack: deepClone({ ruleVersion: RULE_PACK.ruleVersion, provenance: RULE_PACK.provenance }),
    syntheticData: true,
    syntheticDataLabel: SYNTHETIC_LABEL,
    input,
    summary,
    findings,
  });
}

/** Raw text in; either {ok:false, errors} or {ok:true, report}. Never partial. */
export function runValidation(text) {
  const parsed = parseInput(text);
  if (!parsed.ok) return parsed;
  return { ok: true, report: evaluate(parsed.data) };
}
