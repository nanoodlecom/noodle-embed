# State-machine audit — 2026-11-06

Audited all tracked source, demo, tests, package metadata and CI at baseline
`7859e83c5d9a4bf57b6aed885bf32028af779a2e`. There were no open PRs or competing
branches in GitHub's PR inventory. PR #1 (runtime security) was already merged.

## Inventory and invariants

| Machine | States / transitions | Invariant and recovery |
| --- | --- | --- |
| Module registration | Node import → helpers only; browser import → register once; repeated import → existing definition | No browser globals required for pure helpers; never redefine an existing element. |
| Element lifecycle | constructed/detached → connected → decoding → drawable / empty / invalid; connected → detached → reconnected | Only the latest connected decode may commit. Disconnect invalidates its revision, cancels its reader and disconnects its observer; reconnect creates fresh work. |
| Source replacement | missing/invalid/valid source → new source, including A→B→A and removal | Each source attempt has its own revision and AbortController. Clear cached content immediately; a missing source always gets a fallback. |
| Presentation | cached graph + height or width → new layout | Draw from current attributes and width; no decode on height/ResizeObserver changes. Width-only observer checks prevent height redraw loops. Without ResizeObserver, connection and attribute renders still work. |
| Share decoder | URL/fragment → tag → bounded base64 → plain UTF-8 or gzip → JSON → graph/app graph | Unknown tags, invalid base64/JSON/gzip, missing app graph or oversize inputs reject; the element catches rejection and renders fallback. All four documented formats remain supported. |
| Gzip reader | opened → reading chunks → done / size exceeded / decode error / aborted → released | 8 MiB inflated ceiling; supersession/disconnect cancels active readers, signals cannot commit partial output, locks/listeners released in finally. No automatic retry. |
| Graph projection | raw graph → drawable finite nodes → fitted centers → connected wires, or empty | Ignore invalid coordinates and dangling wires; invalid width uses default. Overflowing extents become empty, rather than NaN markup. Unknown types use literal labels, including prototype-key names. |
| Navigation | source → normalized HTTP(S) URL, bare fragment → nanoodle URL, invalid/unsafe URL → home fallback | Escape markup and allow only HTTP(S) schemes. Button activation remains a user action. Prompts/upload fields are never rendered. |
| CI/release | branch → PR tests → reviewed exact head → merge → main tests; independent npm/tag release | CI only tests; merge has no service deploy or npm publish job. npm consumers remain pinned to their installed release until a separate publication. |

No network fetch, execution engine, stored credentials, local/session storage,
database, server job, settlement, background polling or durable retry queue exists
in this repository. Recovery is entirely local: replace a source, resize, or
reconnect. Browser rendering and layout remain synchronous after decoding; the
byte limit bounds input size, but this is not a worker-based CPU isolation scheme.

## Findings and fixes

1. **Stale async render ownership:** a source string equality guard permitted
   A→B→A commits and stale heights, and did not invalidate detached work. Added
   revision ownership, abort/cancel and separate cached drawing.
2. **Missing-source fallback:** normalized `""` compared unequal to missing
   attribute `null`, leaving a blank element or old preview. Fallback now draws
   immediately and recovers after a valid source is provided.
3. **Container resize:** layout was computed only on connection/attribute changes,
   leaving pixel positions stale. Added a disconnected/reconnected ResizeObserver.
4. **Unsafe fallback navigation:** `new URL()` accepted `javascript:`, `data:` and
   `file:` destinations. Only HTTP(S) destinations now reach the button.
5. **Unbounded plain/encoded input:** the inflated-size guard covered gzip only.
   Bound encoded input before base64 allocation and decoded bytes before parsing.
6. **Invalid geometry/type lookup:** nonfinite coordinates/widths could poison all
   layout points, and inherited object keys bypassed unknown-type labels. Validate
   finite geometry/extent and use own-property metadata lookup.

## Verification and release evidence

- Baseline original 10 helper tests passed. Three added helper regressions failed
  against the baseline: unsafe scheme, plain-size bound and malformed geometry.
  Lifecycle regressions also demonstrated blank fallback/unsafe href and absent
  observer/disconnect/cancellation behavior on the baseline.
- Fixed source: 13 helper tests plus 5 lifecycle tests pass directly on Node
  22.23.4 and 24.22.1. Lifecycle tests control pending stream completion to exercise
  supersession, height changes, detach/reconnect, and cancellation. Existing tests
  cover gzip size limits, four encodings, malformed source, layout and links.
- Chromium 156.0.8078.4 / Playwright 1.63 smoke: real gzip/CompressionStream decoding,
  latest height, actual ResizeObserver width redraw, removed-source fallback,
  safe fallback href and detach/reconnect; zero page errors.
- GitHub has no deployment records, Pages returns 404, and the only workflow is
  the test matrix. Existing GitHub release `v0.1.0` and public npm `0.1.0` point to
  `34b09d8bd92efab0a67468a677a536777da2be4a`, with no release assets.
  The README's former npm roadmap item was stale. No npm version, tag, registry
  publication or credentials were changed by this audit.
- Source rollback is a revert of this PR. Consumers using an installed npm
  release are unaffected by this source merge. There is no live service or data
  migration to roll back here.
