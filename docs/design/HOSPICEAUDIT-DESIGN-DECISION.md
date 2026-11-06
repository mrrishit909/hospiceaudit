# HospiceAudit landing page: design decision

Scope: the public landing page only (`index.html` at the repository root plus
`app/landing.css`). The workbench (`app/index.html`, `app/app.js`), engine,
fixtures, tests, build script and CSP are unchanged. Synthetic data only.
HA-DEMO-1 is fictional and makes no clinical, financial, eligibility,
entitlement, regulatory or compliance determination.

## Inputs actually read

Read: `README.md`, `docs/IMPLEMENTATION-RESULT.md`, `app/index.html`,
`app/app.js`, `app/ui.js`, `fixtures/index.js`, `scripts/build.mjs`,
`scripts/serve.mjs` (CSP and MIME map), `src/rules.js`, `src/engine.js`
(finding message templates), `src/report.js` (decision list, note limit,
default decision), `tests/serve.test.js`, `tests/provenance.test.js`, and the
website-playbook `SKILL.md` (via `~/.claude/skills`).

**Not read (sandbox blocked access outside this repository):**
- `~/.agents/skills/website-playbook/SKILL.md` (the `~/.claude/skills` copy was read instead) and its `references/quality-rubric.md` and `references/motion-and-assets.md`. Rubric rows below use the eight criteria named in SKILL.md, not the reference file's detailed checks.
- Atlas `docs/specs/HOSPICEAUDIT-VERTICAL-SLICE.md`, `docs/design/VISUAL-DIRECTIONS.md`, `docs/design/COMPONENT-STANDARDS.md` and `docs/design/DESIGN-RESEARCH.md`. The direction follows the brief in the task message. COMPONENT-STANDARDS may set rules (focus, touch-target size, naming, tokens) that this page does not yet follow. An inspector with access to those files should check them.

## Brief

- **Audience:** technical reviewers and evaluators of the Atlas portfolio. They want to know what the tool checks, how it shows evidence, and where its authority stops.
- **Primary action:** open the real workbench at relative `app/` (Pages path `/hospiceaudit/app/`).
- **Content constraints:** only facts that can be verified in `fixtures/index.js` and the engine. No customers, outcomes, testimonials, logos, legal authority, real records or invitation to load real data. The synthetic label and the human-review limitation stay visible.
- **Technical constraints:** static HTML and CSS, no JS, no external fonts or assets, served under the existing CSP (`default-src 'self'`, inline styles allowed, `connect-src 'none'`). All links are relative.

## Three alternatives

### A. Episode review folio (chosen)

- **Type:** Transitional book serif (Iowan Old Style, Charter, Palatino stack) for headings, system sans for body, monospace for record ids and dates, with tabular numerals.
- **Palette:** porcelain leaves, plum ink, sage rules.
- **Composition:** a bound folio. The hero states one sentence, then Exhibit A shows the golden fixture as three episode leaves on a shared January to March calendar. Each leaf has a reviewer margin holding the findings that cite it. Below sit an index of steps in roman numerals, the four rules, the decision vocabulary and the limits.
- **Motion:** quiet. The leaves rise in turn, the sage bands draw in, and a ring pulses when a record or finding link is followed.
- **Mobile:** each leaf becomes a vertical chronological card (dated records in order, then the margin notes). The axis is dropped because order carries the time.

### B. Case-ledger ledger book

- **Type:** Condensed grotesque headings, monospaced ledger body.
- **Palette:** ruled ledger paper, black and red ink. This continues the workbench's paper and clay styling.
- **Composition:** a double-entry ledger. Records sit on the left and findings on the right in ruled rows, with a red total line at the bottom.
- **Motion:** row-by-row ruling, like ink filling the lines.
- **Mobile:** collapses to stacked row pairs.
- **Rejected because:** ledger and red-total language reads as billing and money, which the product explicitly does not do (no monetary figures). Red ink also implies a verdict.

### C. Instrument panel / signal trace

- **Type:** Geometric sans throughout, with a numeric display face.
- **Palette:** dark slate with cyan and amber signal colors.
- **Composition:** episodes as oscilloscope traces with threshold lines. Findings appear as alert badges in a side rail.
- **Motion:** traces sweep, and badges blink in on threshold crossings.
- **Mobile:** traces scroll sideways.
- **Rejected because:** it is close to a generic monitoring dashboard. Alert styling suggests live clinical monitoring and automated judgement, and sideways scrolling hides the order on phones.

### Why A

The product is a documentation review: a person reads records in date order and writes decisions beside them. A folio with leaves and a reviewer's margin is that activity made visible. It avoids hospital stock (crosses, teal, stethoscopes), money and ledger cues, and dashboard styling. The flagged records carry the visual weight because their findings are each placed beside the record they cite.

## Tokens

| Token | Value | Role |
|---|---|---|
| `--porcelain` | `#f4f2ee` | Page ground, margin panels |
| `--leaf` | `#fbfaf8` | Exhibit sheet, notes, tags |
| `--ink` / `--ink-2` | `#2a1f2b` / `#5d5260` | Body and secondary text |
| `--plum` | `#4b2346` | Headings, CTA, focus ring, anything cited by a finding |
| `--plum-soft` | `#ecdfe8` | `:target` highlight, flag halo |
| `--sage` | `#8fa892` | Episode bands and chronology lines only (not text) |
| `--sage-deep` | `#3d5b47` | Labels, certification markers, small text in sage |
| `--rule` | `#d9d3cb` | Hairlines, double rules, stacked-sheet shadow |

- **Type scale:** h1 `clamp(2.3rem, 6.2vw, 4.75rem)`; h2 `clamp(1.6rem, 3.4vw, 2.5rem)`; body 1.0625rem with 1.6 line height; mono labels 0.72 to 0.85rem.
- **Plum on porcelain is used for flags.** Clean records use sage. The fill (certification) versus hollow (carePlan) marker scheme matches the workbench chronology strip.
- **Contrast:** these values are estimated, not measured. Rough estimates on porcelain are about 6.6:1 for `--ink-2`, 6.8:1 for `--sage-deep` and 11.5:1 for `--plum`. The calculator script was not run here. Use sage only for fills and rules; use `--sage-deep` for any text.

## Hero exhibit: data provenance

The strip is hand-transcribed from `GOLDEN` in `fixtures/index.js`. It is not
live engine output, and the caption says so. Positions are
`(day offset from 1 Jan) / 90 * 100`, using the day midpoint for markers.

| Episode | Span | Billing | Records | Findings (verbatim engine message) |
|---|---|---|---|---|
| EP-1 | 1 Jan to 31 Jan | 1 Feb | D-1 cert. 1 Jan, D-2 carePlan 2 Jan | none |
| EP-2 | 1 Feb to 28 Feb | 15 Feb | D-3 cert. 16 Feb | `HA03:D-3` (1 day after billing), `HA01:EP-2:carePlan` (no record) |
| EP-3 | 1 Mar to 31 Mar | 28 Feb | D-5 carePlan 27 Feb, D-4 cert. unsigned | `HA04:EP-3` (1 day before start), `HA02:D-4` |

- The summary line (3 / 6 / 5 / 5 / 4 / 2) and the one-day gaps are copied from `GOLDEN_ORACLE`.
- Undated items (missing carePlan, unsigned D-4) appear only in the margin. They are never given a date.
- Every decision shows `open`, the engine default (`ReviewLayer.getDecision`). No review outcome is depicted.
- If the fixture changes, this page goes stale silently. Nothing checks it against the fixture.

## Interaction and motion

- **No JS.** Linking uses anchors and `:target`: a flagged record's rule tag jumps to its margin note, and the note links back to the record. Either end gets a plum highlight, and a ring pulses twice when motion is allowed.
- **Motion lives entirely inside `prefers-reduced-motion: no-preference`:** a staggered rise of the hero and leaves, band draw-in, CTA arrow nudge and smooth scrolling. With reduced motion everything is static and fully visible.
- **Accessibility features:** a skip link, one `h1`, semantic `ol`/`article`/`dl` structure and `time datetime`. On desktop the record type text is visually clipped but kept for screen readers. The focus ring is a plum outline.

## Responsive compositions (designed, not yet seen)

- **Phone (base CSS):** a vertical sage line with dated records in chronological order, then the reviewer margin. EP-3's order (carePlan 27 Feb, billing 28 Feb, start 1 Mar) tells its story without an axis.
- **Tablet (>= 46rem):** each leaf is three columns: id and span, chronology list, margin. Steps and rules sit in two columns.
- **Desktop (>= 72rem):** a shared month axis, the horizontal calendar strip with weekly hairlines and month rules, labels in two lanes above the band, dates below, and billing ticks with a bottom-lane label. Steps sit in five columns and rules in four.

## Known risks to check in the browser

- At narrow desktop widths (72 to 80rem) the EP-2 billing tick (15 Feb) and the D-3 marker (16 Feb) sit about 5px apart. The dot is layered above the tick.
- The EP-1 D-1 and D-2 labels rely on two lanes, so check for overlap.
- Long `code` finding ids wrap with `overflow-wrap: anywhere` in the margin.
- The stacked-sheet box shadow at phone widths may clip at the right edge.
- **Visual seam:** the landing page (porcelain, plum, sage) and the workbench (paper, ink, clay) use different palettes. Aligning the workbench was out of scope because `app/index.html` must not change.
- **Stale docs:** `README.md` ("`/` opens the workbench") and the comment in `scripts/serve.mjs` describing the `/` fallback are now stale, because a root `index.html` exists. Neither was edited (out of scope).

## Rubric status (honest)

No browser was run, so every rendered criterion is UNVERIFIED. Source code is not visual evidence.

| Criterion | Intended outcome | Implementation | Evidence inspected | Status |
|---|---|---|---|---|
| Point of view | Archival review folio, product-specific | Exhibit leaves, reviewer margin, plates, double rules | Source only | Unverified |
| Typography | Editorial serif headings, readable sans body, mono ids | System font stacks, clamp scale, tabular numerals | Source only | Unverified |
| Colour | Quiet porcelain, plum and sage; plum carries the meaning | Tokens above | Source only; contrast not measured | Unverified |
| Hierarchy | Claim, exhibit, workflow, rules, decision, limits, CTA | Section order, one primary CTA repeated twice | Source only | Unverified |
| Imagery | Data as the image; no stock or generated media | CSS-drawn strip from fixture facts | Facts cross-checked against `fixtures/index.js` and `src/engine.js` | Unverified (render) / content PASS |
| Motion | Restrained, meaningful, reduced-motion safe | CSS keyframes inside a no-preference query | Source only | Unverified |
| Mobile | Chronological cards, no sideways scroll | Mobile-first base CSS | Source only | Unverified |
| Invisible quality | Semantics, focus, no network, CSP-safe | Skip link, landmarks, `time`, relative links, no JS | Source only; tests and build not run here | Unverified |

**Still needed:** a production build, screenshots at 1440x900, 768x1024 and
390x844, a keyboard-only pass (skip link, nav, both `:target` directions, CTA),
a reduced-motion check, axe, contrast measurement, a check that the CSP shows no
violations, and confirmation that `app/` resolves under `/hospiceaudit/`.
