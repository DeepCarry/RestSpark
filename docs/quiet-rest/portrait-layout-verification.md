# Portrait layout verification — 2026-11-09

Branch: feature/quiet-rest-ui. Includes 58be2ef and f373beb.

The approved stretch.png remains byte-for-byte unchanged. Native Electron image decoding reports 442×765 pixels; nonzero-alpha bounds are x=0..441, y=0..764. There is no wholly transparent right margin. Keep height:100vh, width:auto, right:0, bottom:0 and the original fade.

## Regression and fix

At 700×1000, the height-scaled image starts at x=122.23 while the text extends to x=411.99. The previous width-only 680px breakpoint misses narrow tall windows. Extend the existing single-column/image-hidden rule to aspect ratios <=3/2. Normal landscape layouts retain the portrait. No scheduling, IPC, settings, artwork, branding or version changes.

The isolated actual macOS Electron QA now checks both break types at 1920×1080, 2560×1440, 3440×1440, 3840×2160, 700×1000 and 600×620. It asserts right anchoring, source aspect ratio, text separation and no horizontal overflow; narrow/tall viewports hide the illustration. Large resolutions use Electron device emulation and fit-to-window captures, not physical monitors.

## Validation

- npm test: 19 files, 331 tests passed after restoring incomplete Electron installation. Initial attempt had 7 suite-load failures caused by missing Electron runtime files; no test assertions failed.
- npm run lint and git diff --check passed.
- npm run pack passed (arm64, ad-hoc signing; notarization skipped). The branch still uses upstream Stretchly 1.20.0 package metadata; product version 0.1.0 and brand-branch integration remain outside this layout change.
- Actual app QA: 73 checks passed, including strict mode, countdown, skip/postpone, manual/automatic completion, persistence, English/Chinese, dark/light and long content.
- Actual current-display Chinese long/short screenshots reviewed; viewport screenshots are provided separately for final user acceptance.

Run: REST_LAYOUT_EVIDENCE=/absolute/output/path node_modules/.bin/electron scripts/quiet-rest-qa.mjs
Use --layout-only for the viewport matrix without the complete interaction suite. Profiles are temporary and isolated from user settings. Evidence for this run is in the Codex chat outputs/rest-layout directory.
