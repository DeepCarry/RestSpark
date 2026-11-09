# Rest Spark / 元气 branding implementation plan

Base: feature/quiet-rest-ui, commit 6d9bcb5. Work: feature/rest-spark-brand. Destination: a new independent private repository DeepCarry/RestSpark; existing Fork remains unchanged. Scope: macOS brand integration, compatible settings import, Fork-only update notifications; keep original reminder behavior, approved mint UI/person, BSD license and upstream credits. Spec: brand/README.md and sole master brand/svg/restspark-app-icon-master.svg; use supplied exports byte-for-byte.

## Architecture and decisions
- `app/utils/brand.js`: fixed English product name Rest Spark, localized display 元气 for Chinese, bundle identity io.github.deepcarry.restspark, DeepCarry release/issue links. User follow-up explicitly authorizes a new independent private DeepCarry/RestSpark repository. Preserve history and the original Fork, with no merge into trunk and no formal release.
- `app/utils/brandProfile.js`: choose independent Rest Spark profile on normal launches. Respect explicit `--user-data-dir`/programmatic custom paths and Windows portable Data. After acquiring the new profile lock, import old config.json, images and contributor stamp by copy, publish config last; preserve the legacy directory and never overwrite an existing new config. Fail visibly instead of silently resetting if legacy data cannot be read/parsed/copied. Preserve unknown settings and internal migration metadata.
- Application name is stable English for bundle/process/path; Chinese UI labels use 元气. macOS CFBundleDisplayName can be 元气 with executable/product Rest Spark. No Apple signing entitlement or notarization claim.
- Updates are the existing read-only version notifications, not an automatic binary installer. Switch all feed/download links to DeepCarry/RestSpark and handle 404/no release without an update prompt. Keep checkNewVersion/notifyNewVersion/disableAppUpdateFeatures semantics.
- macOS tray must use the approved monochrome template regardless of old color preference. Keep default/time/progress choices meaningful: approved mark plus status overlays, paused mark distinguished without changing the logo geometry. Explicit setTemplateImage(true). Other-platform old assets retained; packaging guarded until platform identities/assets are reviewed, especially upstream Windows Store identity.
- Do not replace decorative photography/person. Replace app/badge/footer brand marks, preferences/about/welcome names/icons, locale product references, system notification names and app metadata. Keep upstream support/donation links identified as Stretchly upstream rather than implying they support Rest Spark.

## Tasks and acceptance
- [x] Preserve approved package/provenance; inspect current code and establish independent branch.
- [x] Add failing behavioral tests for profile routing/import, existing-target protection, corrupt/failing import, retries and unknown settings; implement and prove copied source remains untouched.
- [x] Test update feed success/404/network failure and no upstream redirects; integrate metadata, localized branding and immutable approved icons.
- [x] Test tray rendering on macOS for default/paused/time/progress and template behavior; retain existing non-macOS branches. Never erase status semantics by using an identical icon for every mode.
- [x] Run targeted/full tests, lint and macOS pack; check actual Info.plist bundle ID/name/icon, app.asar contents and retained LICENSE.
- [x] Run production main/preload/renderer in isolated test profiles, including seeded legacy import plus second launch, settings persistence, Chinese/English/dark views and reminder regression. Capture and open actual screenshots; inspect supplied 16–22px icons and native tray template. Do not install/overwrite the existing user app or profile.
- [x] Independent whole-branch review, fix confirmed regressions, record exact verified/unverified boundaries, commit and push feature branch. No trunk merge or formal release.

## Risks to check
Explicit custom profiles must not import real personal settings during QA; new-profile existing config wins; image copy failures never publish a partial settings import; app ID change must not reuse upstream update targets or Store publisher; existing autostart setting must survive in copied config without operating the user's real login items during QA. Real install/uninstall, signed upgrades and multiple displays require separate external validation.

## User steering — private independent repository
Create DeepCarry/RestSpark as private (not another fork), retain full history and BSD/author attribution, point origin and active metadata/update checks there. Bootstrap trunk from unchanged upstream base e11920f, retain phase-one branch and submit branding only on feature/rest-spark-brand. Do not push new work to the public Fork. Authenticated private-release distribution is not yet configured; keep tokens out of the app and treat anonymous 404 as no available update.

## Completion ledger
Independent reviewer found two important migration edge cases: an early import failure could not quit cleanly, and an explicit saved login preference could be replaced by the new bundle's native status. Both reproduced RED, fixed, and reverified with unit and actual Electron startup-failure tests. The final suite passes 349 tests; the production-renderer macOS flow passes 44 checks, plus a normal second-launch persistence check and packaged-app smoke.

Ruling: keep the immutable approved macOS template and show minutes / progress percentage / pause status beside it. This preserves status information without inventing a modified logo; percentage replaces the old tiny progress-ring presentation. Mac-only color-radio UI is hidden while the stored value remains untouched for compatibility.
Ruling: bootstrap the private repository default trunk from unchanged e11920f, retain the prior UI branch, and put all brand work on feature/rest-spark-brand. This avoids merging unapproved development into the main branch. Root README changes are on the feature branch until review.
Ruling: do not embed private GitHub credentials or use upstream update releases. Anonymous live access returned 403 due API rate limiting; formal private/public update distribution remains unconfigured.
External limit: native Tray.getBounds returns height 0 in this environment; template loading is verified but the on-screen macOS menu item and Dock are not visually accepted. See DELIVERY.md rather than treating the generic QA passed count as proof of these external surfaces.
