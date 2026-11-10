# Independent long-break interval V3

Approved scope: replace work cycles with minutes; six presets30/45/60/90/120/180; custom30–180minutes, fresh default60. Long cadence independent of mini interval. Preserve old settings via derived-minute migration and backup. Existing reminder visuals unchanged. Continue current feature branch; no merge/publish.

Architecture: independent work-time accumulator tracks elapsed work since each break; one existing Scheduler still handles the next event/notification/window. Mini break duration does not count toward long work time; a long break resets both cadences and wins ties. Notifications/postponing/forced breaks and pause/reset paths retain their APIs. Settings changes replan waiting events without interrupting an active break. Tray text uses remaining time, no cycle counts.

- [x] Tests first:40min mini +60min long, coincident deadlines, long-only/mini-only, notifications, postponed mini crossing long deadline, manual breaks, pause/reset, settings changes.
- [x] Add old-config migration, backup/idempotence and fresh-install tests; new longBreakInterval millisecond key, retain obsolete legacy count for compatibility/history.
- [x] Implement work-time accumulator + planner integration, truthful tray text and replan after timing/enable changes.
- [x] Simplify numeric editor/model to direct30–180minutes and six presets; remove cycle conversion/helper/linked-conflict UI. Update translations and regressions.
- [x] Actual Electron/macOS scenarios including real mini/long windows with short temporary intervals, invalid input, reload, popup geometry, all six presets, independent save.
- [x] Full suite/lint, independent review, sequential build, packaged check, restart actual user instance and verify migration preserves old effective long interval.

Review focus: elapsed work excludes breaks/manual-await/pause; notification delay clamps; postpone cannot create back-to-back stale mini; enabling/disabling/replanning never overlaps windows; old interval migration is atomic and preserves manual data; only new edited values use bounds.

## Reviewed boundaries and evidence

Independent read-only review identified starting-window overlap (P1), clamped notification/tray mismatch(P2), and stale-mini replay after sleep with pause disabled(P2). All reproduced in RED tests and fixed. Loading completion/forced replacement also gained RED→GREEN regressions. Explicit starting phase now pauses work before window load; replan does not replace loading/active windows; actual clamped lead feeds notifications/tray; wake recomputes earliest independent due event.

Final full suite423tests/27files, lint and diff check pass. Real macOS test536checks/48panel layouts passes; test-only4s mini/6s long produced actual mini→long→mini windows without overlap, retaining active work accounting. Build follows testing sequentially.

Final:423tests and536native checks/48panel layouts passed;13packaged files match source. Actual user instance restarted after stale process lock was removed; all prior configuration fields preserved, legacy effective80minutes migrated to direct80minutes, six presets and translations verified. See DELIVERY.md for evidence and remaining platform limits.
