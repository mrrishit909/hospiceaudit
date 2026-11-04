# HospiceAudit — bounded synthetic episode documentation review

HospiceAudit is a small, dependency-free Node 24 ESM engine plus a static
workbench that checks **synthetic** hospice episode records against the
**fictional** documentation rule pack `HA-DEMO-1`, produces a deterministic,
frozen findings report, lets a human attach review notes and decisions, and
exports the result as JSON or CSV.

> **Synthetic data only. Fictional rule pack. No authority.**
> Every fixture in this repository is invented. `HA-DEMO-1` is a demonstration
> documentation contract: it is not derived from and asserts nothing about
> Medicare, CMS or any regulator's policy or timing. The engine makes no
> eligibility, diagnosis, treatment, entitlement or financial determination and
> emits no monetary figures. Nothing here is production software. A qualified
> hospice compliance expert must review any future authoritative rule pack, and
> separate privacy, security and legal approval must precede any real patient
> data. The tests in `tests/` are the implementer's own checks, not an
> independent audit.

## Run

```sh
npm test          # = node --test "tests/**/*.test.js"   (Node >= 24, no npm install needed)
npm run serve     # = node scripts/serve.mjs  -> http://127.0.0.1:8787/  (loopback only; PORT=... to change)
```

The server binds `127.0.0.1` only, serves this repository with correct MIME
types and a `script-src 'self'` CSP, denies dotfiles (`.git`, etc.) and any
path containing `..` or malformed percent-encoding, and makes no other network
calls. `/` opens the workbench (`app/index.html`). Press Ctrl+C to stop it.

## Input contract (`schemaVersion: 1`, `ruleVersion: "HA-DEMO-1"`)

```json
{
  "schemaVersion": 1,
  "ruleVersion": "HA-DEMO-1",
  "episodes":     [{ "id": "EP-1", "startDate": "2026-01-01", "endDate": "2026-01-31", "billingDate": "2026-02-01" }],
  "documents":    [{ "id": "D-1", "episodeId": "EP-1", "kind": "certification", "signedDate": "2026-01-01" }],
  "requirements": [{ "episodeId": "EP-1", "kind": "certification" }]
}
```

Validation is atomic: either the whole payload is accepted or a bounded list
of coded errors is returned and **nothing** is processed (no partial report).

- Exactly the keys above at root and record level; unknown or missing keys reject.
- `schemaVersion` must be `1`; `ruleVersion` must be `HA-DEMO-1`; anything else rejects (`UNSUPPORTED_*`) rather than guessing.
- Dates are date-only ISO calendar strings (`YYYY-MM-DD`) validated as real calendar dates, including leap years; comparisons are whole calendar days with no timezone conversion. `signedDate` may be `null` (unsigned) and nothing else may be null.
- `startDate <= endDate` is enforced at schema level (`DATE_ORDER`).
- `kind` is `certification` or `carePlan`. IDs are non-empty strings of at most 200 UTF-16 code units; IDs are unique per array, requirement pairs are unique, and every `episodeId` must resolve (`UNRESOLVED_REFERENCE`).
- Bounds: raw text at most 1 MiB UTF-8 (checked before parsing), at most 1,000 records across all arrays, nesting depth at most 8, error list capped at 200. Counters use checked integer addition.

## Rules (fictional contract `HA-DEMO-1`)

| Rule | Finding id | Meaning |
|---|---|---|
| HA01 | `HA01:<episodeId>:<kind>` | No document exists for a required episode/kind pair |
| HA02 | `HA02:<documentId>` | An existing document has `signedDate: null` |
| HA03 | `HA03:<documentId>` | `signedDate` is after the episode's `billingDate` (calendar days) |
| HA04 | `HA04:<episodeId>` | `billingDate` is before the episode's `startDate` |

A document yields HA02 or HA03, never both; a missing pair yields HA01 only.
Presence does not mean validity. The literal golden fixture in
`fixtures/index.js` yields exactly four findings
(`HA01:EP-2:carePlan`, `HA02:D-4`, `HA03:D-3`, `HA04:EP-3`) with summary
episodes 3 / required pairs 6 / present pairs 5 / documents 5 / affected episodes 2.

## Output: the report

`runValidation(text)` returns `{ ok: false, errors }` or `{ ok: true, report }`.
The report is **deep-frozen** (mutation throws in strict mode) and contains:

- `schemaVersion`, `ruleVersion`, `rulePack` (`{ ruleVersion, provenance }` — provenance states the pack is fictional and names its source spec),
- `syntheticData: true` and `syntheticDataLabel`,
- `input` — an untouched snapshot of the validated input,
- `summary` — `episodes, requiredPairs, presentPairs, documents, findings, countsByRule, affectedEpisodes`,
- `findings[]` — sorted by rule id then entity ids (code-unit order); each has `id, ruleId, ruleVersion, title, message, episodeId, documentId, kind, entityIds` and `evidence` with the cited `episode`, `document`, `requirement` records plus `daysAfterBilling` / `daysBeforeStart` where relevant.

Output is deterministic: input array order does not change findings, and two runs are byte-identical.

## Review layer and exports

Reviewer notes (strings, at most 2,000 characters) and decisions
(`open | confirmed | dismissed | escalated`) live in a `ReviewLayer` outside the
frozen report; adding them leaves the validation output byte-identical.

- **JSON** — `buildExport(report, { generatedAt, sourceHash, notes, decisions })` then `serializeExport(...)`. The export carries `exportVersion: 1`, the synthetic label, rule pack provenance, the input snapshot, summary, findings and `review`. The serializer escapes `</` as `<\/` and U+2028/U+2029 so the text is inert inside HTML; `reparseExport(text)` parses it back and checks the shape. The engine never reads the clock or hashes input itself; callers inject `generatedAt` (ISO-8601 UTC) and an optional SHA-256 `sourceHash`.
- **CSV** — `findingsToCsv(report, review)`: RFC 4180 quoting, CRLF line ends, formula-leading cells neutralised, a `SYNTHETIC DEMO DATA` label on every row.

## Workbench (`app/`)

`app/index.html` + `app/app.js` wire the real engine from `src/` into the
journey: load a named synthetic fixture or import a JSON file (size checked
before reading) → inspect the source records → run the rules → read the
summary and per-episode chronology strips → filter findings by rule, kind or
entity text → open a finding to see its cited records, computed evidence and
rule pack provenance → record a decision and note → export JSON or CSV.
Loading, empty, invalid-file and export-error states are real. Rendering uses
`createElement`/`textContent` only (no `innerHTML`, no `eval`, no external
URLs, fonts or CDNs). `app/ui.js` holds the DOM-free helpers that the tests
import.

## Limitations

- Demonstration slice only. Four fictional rules, two document kinds, one rule version. No claim of regulatory or clinical correctness.
- The workbench has **not** been verified in a browser in this session (no browser tooling was available): rendering, keyboard journey, mobile layout and download behaviour are unverified. It was syntax-checked and imported under Node only.
- No persistence: notes and decisions live in memory until exported.
- Exports are downloaded files; the workbench does not yet reimport an exported report (the round-trip is covered by `tests/review-export.test.js` and `tests/adversarial.test.js`).
- The static server is a local development convenience, not a hardened production server.
- The repository has no CI configuration by design.
