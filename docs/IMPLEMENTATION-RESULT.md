# HospiceAudit — implementation result (resume session, 2026-11-04)

Synthetic data only; fictional rule pack `HA-DEMO-1`; no regulatory, legal or
clinical authority is claimed anywhere. The checks below are the implementer's
own tests, **not an independent audit**; source is unverified until the root
review checks it.

## Test command and result

```
cd <checkout>/hospiceaudit
node --test "tests/**/*.test.js"      # also: npm test
```

Final run of this session (summary lines pasted verbatim):

```
ℹ tests 51
ℹ suites 0
ℹ pass 51
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Session start state was 48 pass / 3 fail (adversarial 7, both serve tests).

## Files changed in this session

- `package.json` — `"test"` script changed from `node --test tests/` (fails on Node 24: "Cannot find module .../tests") to `node --test "tests/**/*.test.js"`.
- `src/report.js` — `serializeExport` now escapes `</` as `<\/` and U+2028/U+2029 as ` `/` ` (all valid JSON escapes, so `reparseExport` recovers the exact text). The separator characters are built with `String.fromCharCode` because they are JS line terminators and must not appear literally in source (a first attempt that embedded them literally broke the module and was corrected).
- `scripts/serve.mjs` — `resolvePath` rejects paths that do not start with `/`, contain a null byte or backslash, fail percent-decoding, or contain any dot-segment (`.`, `..`, dotfiles such as `.git`) **before** any normalisation, so `/../package.json` and `/%2e%2e/x` return `null` instead of being normalised onto a real file. The request handler now passes the **raw** request path to `resolvePath` (the WHATWG `URL` parser would have silently normalised `/../x` to `/x`); a raw-socket `GET /../package.json` is answered 404. `/` falls back to `app/index.html` when the repository root has no `index.html`.

## Files added in this session

- `app/app.js` — DOM wiring for the workbench (the serve test's contract requires `/app/app.js`). Imports the real engine (`parseInput`, `evaluate`, `buildExport`, `serializeExport`, `findingsToCsv`, `ReviewLayer`, `LIMITS`, `RULE_PACK`) and the DOM-free helpers in `app/ui.js`. Renders via `createElement`/`textContent` only; no `innerHTML`, `eval`, external URLs, fonts or CDNs. Journey: load named fixture or import JSON file (size checked against `LIMITS.MAX_BYTES` before reading) → source record tables → run rules → summary chips and per-episode chronology strips (`timelineGeometry`) → filter by rule/kind/entity text (`filterFindings`) → evidence panel with cited records, computed evidence, rule pack provenance, decision select and bounded note → JSON/CSV export with `generatedAt` and SHA-256 `sourceHash` (via `crypto.subtle`, `null` if unavailable). Loading, empty, invalid-file and export-error states are rendered from real engine results.
- `app/index.html` — the page (inline CSS, case-ledger direction: paper/ink palette, serif display, monospace for ids and dates, one clay accent for flagged chronology; single column under 900px; `:focus-visible` outlines; `aria-live` status lines; reduced-motion respected).
- `README.md` — purpose, disclaimer, run instructions, input contract, report shape, exports, limitations.
- `docs/IMPLEMENTATION-RESULT.md` — this file.

No test file was modified. No test was weakened. No test correction was needed: every previously failing assertion was satisfied by changing the implementation.

## Verification performed (implementer's own, not an audit)

- `node --test "tests/**/*.test.js"`: 51/51 pass (golden oracle of exactly four findings and the 3/6/5/5/2 summary, clean variant, eight adversarial cases, determinism, immutability, schema bounds, review/export round-trip, CSV, serve, ui helpers).
- `node --check app/app.js` and a Node import of `app/app.js` without a DOM: ok.
- Serializer check: an export containing `</script>` and U+2028 in a note contains neither raw sequence and reparses to the identical note.
- In-process server smoke test: `/`, `/app/`, `/app/app.js`, `/app/ui.js`, `/src/index.js`, `/fixtures/index.js` → 200 with correct MIME; `/.git/config`, `/..%2F..%2Fetc%2Fpasswd`, `/nope.js` → 404; raw-socket `GET /../package.json` → 404. Server closed after each check; no process left running.

## UI status

Implemented and wired to the real engine, but **not verified in a browser** in this session (no browser tooling available; hard time budget). Unverified by name: visual rendering, chronology strip geometry on screen, keyboard-only journey, mobile layout at narrow widths, file import dialog, and Blob download of exports. Website playbook rubric statuses are therefore UNVERIFIED for Typography, Colour, Hierarchy, Motion and Mobile; Point of view and Invisible quality rest on code review only.

## Known limitations and what was NOT done

- No browser evidence (screenshots or interaction) for the workbench.
- The workbench does not reimport an exported report; round-trip is covered only by tests.
- No persistence of notes/decisions beyond the page session.
- No root `index.html` landing page; `/` serves the workbench directly.
- No CI configuration, no deployment, no git operations (root handles git).
- Demonstration slice: four fictional rules, two kinds, one rule version; no regulatory, clinical or financial claims.
