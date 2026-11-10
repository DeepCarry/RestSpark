# Schedule controls V2 implementation plan

User approved docs/rest-spark/settings-v1/SCHEDULE-CONTROLS-V2-PROPOSAL.md. Continue existing feature/settings-design-system-v1; preserve running user preferences. Use development-quality and test-first implementation.

Architecture: shared pure schedule validation/conversion module; acknowledged IPC endpoint validates/commits one patch and updates the tray once (existing scheduler semantics unchanged); four numeric editors share a compact anchored preset dialog. Keep scheduler semantics, old values and original user content.

- [x] Add failing boundary/legacy/conflict validation tests; implement pure rules and new-install defaults.
- [x] Add acknowledged validated schedule IPC; preserve existing generic advanced settings API.
- [x] Replace long selects with native numeric inputs, units, edit actions, ≤8 presets in viewport-bounded popovers; preserve IDs, add labels/errors/legacy state. Update renderer/i18n and affected regression tests.
- [x] Replace only general nav icon with matching outline gear.
- [x] Test editable input, empty/cancel/invalid/reselect, linked 45×4 conflict, legacy values, asynchronous save/error handling and translated units.
- [x] Actually open panels in real macOS Electron at edges, scrolling, resizing, light/dark, zh/en, zoom; inspect screenshots. Full tests + lint, then sequential build and packaged UI checks.
- [x] Independent final code review, fix findings, commit; restart and inspect user's actual instance. No merge/release.

Review focus: stale settings during saves, atomic linked patch, multiple editors/focus/escape/outside click, panel clipping/position at zoom, historical out-of-range values, async translation and runtime instance alignment.

## Review and decisions (2026-11-10)

- Keep the existing scheduler behavior when settings are saved; the patch is atomically persisted and the tray updated once. This does not reset an ongoing break or introduce an independent long-break timer.
- Independent reviewer found two P2 issues: delayed translation revived cancelled validation/actions, and excessive historical interval combinations lacked a legacy badge. Added observed failing regressions and fixed both with draft revisions / composite legacy detection.
- Actual opened-panel verification found border-height mismatch on upward placement; regression observed 6px instead of8px then passed after measuring border-inclusive panel bounds. Mixed legacy hint heights also misaligned input columns; fixed row alignment and included real geometry assertion.
- First real-run window was unexpectedly destroyed, so that run was retained as failed. A new instrumented run and final run completed48layouts and265checks. No unsupported conclusion about why the window closed.
- Full suite400tests/25files, StandardJS and diff check pass; packaging runs sequentially after coverage generation.

Final native acceptance:265checks/48opened-panel combinations passed. Packaged fresh-install defaults passed. User instance restarted via macOS using the existing profile;40min/300sec/3cycles/5min remained unchanged, changedKeys=[], all4pages resolve translation keys.11packaged files match working source bytes. Remaining limits are documented in DELIVERY.md.
