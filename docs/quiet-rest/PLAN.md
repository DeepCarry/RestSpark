# Quiet Rest phase one implementation plan

Goal: implement the approved three-screen design on the existing Electron app without changing the scheduler, settings schema, security bridge, identity or trunk.
Spec: [handoff](HANDOFF.md), [sole approved visual](assets/approved-ui-master.png).
Architecture: retain the HTML controls, translated ideas, IPC, scheduling and persistence. Add scoped shared theme tokens, reusable SVG countdown presentation, crop only static illustration from the master. Use native buttons for break actions. Refactor schedule markup into cards while keeping IDs, names, range limits and divisors. Default settings view becomes Schedule, with every original section still reachable.

## Tasks and checks
- [x] Inspect Fork trunk, existing renderers, preload, defaults and test commands; create feature/quiet-rest-ui. Capture original three macOS windows in a disposable profile.
- [x] Add renderer regression tests for immediate countdown, remaining fraction, postpone/skip eligibility, strict mode and manual finish. Establish failure for new clock/ring, then integrate shared countdown display into both original renderers.
- [x] Add light/dark tokens and break layouts; extract right-side illustration without changing the person. Preserve customized idea HTML sanitizing, images, configured color, health warning and clock. Validate long text and narrow windows.
- [x] Group original schedule controls into mini/long/strict cards; add sidebar and header. Keep all settings bindings and restore-default guard. Preserve range values rather than reducing to fixed dropdown options. Ensure checkboxes/radios are keyboard reachable and every range has a label/output association.
- [x] Run npm test, npm run lint, npm run pack. Use disposable-profile macOS Electron QA to capture before/after, operate both break pages and all settings, check stored values, strict states, languages, appearance and responsive bounds. Inspect captured images.
- [x] Record exact outcomes and environment limits, review diff and commit feature branch. Push branch to Fork if credentials permit; never merge trunk.

## Review focus
- Strict mode must never expose early skip; postpone deadline and manual completion must remain consistent with original scheduler.
- Preserve arbitrary existing supported slider values and negative-checkbox semantics; do not reset other settings.
- Ideas can contain long translated text, safe links and local images; no clipped content or unsafe new network access.
- Windows vary with configured break size/fullscreen/DPI; prioritize legibility and accessible actions when space is limited.
- Keep existing notification, sound, idle/DND and multi-display behavior; test evidence must distinguish exercised IPC from untested physical external conditions.

## Environment observations
Base: e11920f, Stretchly 1.20.0, Electron 41.1.0, macOS 27.2 arm64. Repo requests Node 24 (.nvmrc); host initially has Node 26.10.0. npm 11 skips dependency scripts; runtime setup requires separate installation. Initial baseline tests/lint were attempted before Electron installation finished and with a sandbox-blocked lint cache; rerun after runtime setup and with a temporary XDG cache. npm ci reports 39 inherited audit findings; no dependency upgrades in UI scope.

## Completion ledger
All planned tasks completed. Native inline implementation and one independent reviewer were used. Review found a slow-IPC event-binding race and a window-resize reset; both reproduced RED then fixed with persistent tests. English option width was corrected after inspecting screenshots. Final code suite: 331 tests; actual macOS QA: 37 checks. See DELIVERY.md for evidence, decisions and remaining external checks.
