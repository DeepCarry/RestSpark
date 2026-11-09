# Settings Design System V1 — implementation and acceptance

Spec: user-approved 2026-11-09 ZIP, README, Design System V1, implementation notes and five PNG references. The attachment is design/reference data; the user's request sets authorization. No merge, release, asset replacement or timer rewrite.

Base: origin/trunk at task start (clean, 0 ahead / 0 behind). Branch: feature/settings-design-system-v1.

Architecture: retain Electron/preload/settings keys and schedule conversions. Replace settings-only CSS rather than layering overrides. Scoped tokens consume the approved rest palette without changing break-window CSS. Semantic cards/rows share typography and controls. zh-CN/en get complete new copy; other locales fall back to English for new keys.

## Plan and completion ledger

- [x] Capture four original macOS pages using production IPC and temporary userData.
- [x] Establish shared settings tokens, cards, rows, accessible switches/selectors and responsive sidebar; rebuild General/Schedule retaining original binding keys.
- [x] Replace six theme choices with approved mint preview; retain real sounds/menu styles, platform visibility and legacy color backup/migration before windows initialize.
- [x] Rebuild About with runtime version, truthful update status, clickable project/developer rows, expandable full BSD license/attributions and debug shortcut.
- [x] Run targeted DOM/migration regression, full Vitest, StandardJS, macOS app interaction matrix, package and packaged smoke. Inspect actual screenshots and record visual differences.
- [x] Review diff, preserve evidence, commit feature branch; do not merge/publish.

## Acceptance / review focus

- Preserve nonstandard saved time values and long interval count -> actual minutes when short interval changes.
- Never persist both break types disabled; independent strict toggles and negative booleans retain meaning.
- Migration backs up legacy color before changing only theme keys, is idempotent and retains unknown/manual fields.
- Chinese/English, light/dark, 860×740 / 760×700 / 620×680, 125% zoom; content scroll only; no horizontal overflow or inaccessible controls.
- Native input focus, labels, sound preview buttons, restore-default confirmation, debug and external links remain usable.
- Missing/offline release returns honest status. No upstream update URL or hardcoded application version.
- License and source attribution present in source and built app; logo/artwork and reminder/timer files unchanged.

## Decisions

User requests direct implementation from the approved design: no additional design approval gate. Use existing checkout on the requested feature branch. Screenshot example state is not a business specification. Retain transparentMode: source inspection confirms it changes reminder background opacity; expose its real switch under Appearance. macOS always uses template tray artwork; keep color options on other supported platforms. Keep hidden upstream support DOM for compatibility, never expose it as a fifth page.

## Final review and evidence

Independent read-only reviewer found one P2: update lookup blocked appearance initialization. Reproduced with a pending request, covered by a failing regression, then fixed by initializing local controls before the network query. Final suite includes 362 passing tests. Visual review additionally found imprecise duration formatting: 80.5 seconds became 1.3 minutes; derived interval output truncated 45.75 to 45. Both have observed RED→GREEN regressions.

Visual differences and environmental limits are recorded in DELIVERY.md. The tests and pack initially ran concurrently; pack attempted to read a coverage file removed by Vitest. Retained failure logs and reran pack sequentially after the suite, with no production change needed.
