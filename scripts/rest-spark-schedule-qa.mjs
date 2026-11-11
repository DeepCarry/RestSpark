// Actual macOS UI, native popover geometry and production IPC. Disposable profile only.
import { app, BrowserWindow, nativeTheme } from 'electron'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
const root = resolve(import.meta.dirname, '..')
const evidence = process.env.REST_SCHEDULE_EVIDENCE || join(root, 'docs/rest-spark/settings-v3/evidence')
mkdirSync(evidence, { recursive: true })
const profile = mkdtempSync(join(tmpdir(), 'restspark-schedule-v3-'))
app.setPath('userData', profile)
app.setPath('logs', join(profile, 'logs'))
writeFileSync(join(profile, 'config.json'), JSON.stringify({ isFirstRun: false, language: 'zh-CN', disableAppUpdateFeatures: true, checkNewVersion: false, openAtLogin: false, _migratedOpenAtLogin: true, naturalBreaks: false, monitorDnd: false, microbreakInterval: 1800000, microbreakDuration: 25000, breakInterval: 2, breakDuration: 3600000, manualUserField: 'preserved' }))
const checks = []
const verify = (condition, name) => { assert.ok(condition, name); checks.push(name) }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
await import('../app/main.js')
app.whenReady().then(async () => {
  await delay(1700)
  app.emit('second-instance', {}, [], root, ['preferences'])
  let prefs
  for (let i = 0; i < 100; i++) {
    prefs = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/preferences.html'))
    if (prefs && !prefs.webContents.isLoading()) break
    await delay(100)
  }
  assert.ok(prefs)
  prefs.on('close', event => console.log('QA_WINDOW_CLOSE', new Error().stack))
  prefs.webContents.on('render-process-gone', (event, details) => console.log('QA_RENDERER_GONE', JSON.stringify(details)))
  prefs.webContents.on('console-message', details => { if (details.level === 'error') console.log('QA_RENDERER_ERROR', details.message) })
  const js = expression => prefs.webContents.executeJavaScript(expression)
  const config = () => JSON.parse(readFileSync(join(profile, 'config.json')))
  const capture = async name => { prefs.show(); prefs.focus(); await delay(160); writeFileSync(join(evidence, `${name}.png`), (await prefs.webContents.capturePage()).toPNG()) }
  const edit = async (id, value) => {
    await js(`(() => { const input = document.getElementById('${id}'); input.value = '${value}'; input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-editor-for=${id}] [data-apply]').click() })()`)
    await delay(250)
  }
  const choose = async (id, value) => {
    await js(`document.querySelector('#${id}').scrollIntoView({ block: 'center' }); document.querySelector('[data-editor-for=${id}] [data-presets]').click()`)
    await delay(100)
    await js(`document.querySelector('.schedule-popover [data-preset-value="${value}"]').click()`)
    await delay(250)
  }
  await delay(700)
  prefs.setSize(860, 740)
  nativeTheme.themeSource = 'light'
  verify(await js("document.querySelector('#miniBreakFor').value === '25' && document.querySelector('#longBreakFor').value === '60'"), 'legacy durations preserved on initial load')
  verify(config().manualUserField === 'preserved', 'manual preferences preserved')
  verify(await js("Math.abs(document.querySelector('#miniBreakFor').getBoundingClientRect().top - document.querySelector('#miniBreakEvery').getBoundingClientRect().top) < 1"), 'mixed legacy hints keep numeric inputs aligned')
  await capture('initial-legacy-schedule')
  const rejected = await js('window.settings.saveSchedule({ microbreakDuration: 35000 })')
  verify(!rejected.ok && config().microbreakDuration === 25000, 'main process rejects off-step values')
  for (const [id, invalid] of [['miniBreakFor', ''], ['miniBreakFor', '35'], ['miniBreakFor', '310'], ['miniBreakEvery', '61'], ['longBreakFor', '61'], ['longBreakEvery', '181']]) {
    const before = readFileSync(join(profile, 'config.json'), 'utf8')
    await edit(id, invalid)
    verify(await js(`document.querySelector('#${id}').getAttribute('aria-invalid') === 'true'`), `${id}=${invalid}: inline invalid state`)
    verify(readFileSync(join(profile, 'config.json'), 'utf8') === before, 'invalid input never reaches persistent settings')
    await js(`document.querySelector('[data-editor-for=${id}] [data-cancel]').click()`)
  }
  await choose('miniBreakFor', '90')
  verify(config().microbreakDuration === 90000, 'native preset selection persists seconds')
  await edit('miniBreakFor', '70')
  verify(config().microbreakDuration === 70000, 'custom seconds persist exactly')
  await js("(() => { const input = document.querySelector('#miniBreakFor'); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('.schedule h1').click() })()")
  verify(await js("document.querySelector('#miniBreakFor').value === '70'"), 'outside click cancels empty draft')
  await js("document.querySelector('[data-editor-for=miniBreakFor] [data-presets]').click()")
  await delay(100)
  await js("document.querySelector('.schedule-custom').click(); const input = document.querySelector('#miniBreakFor'); input.value = '80'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))")
  await delay(250)
  verify(config().microbreakDuration === 80000, 'custom entry and Enter commit through actual IPC')
  await edit('miniBreakFor', '70')
  await choose('miniBreakEvery', '20')
  verify(config().longBreakInterval === 5400000, 'migration preserves original30minute ×3 effective long interval')
  for (const minutes of [30, 45, 60, 90, 120, 180]) {
    await choose('longBreakEvery', String(minutes))
    verify(config().longBreakInterval === minutes * 60000, `long interval preset ${minutes} persists independently`)
  }
  await choose('longBreakEvery', '60')
  await edit('miniBreakEvery', '40')
  verify(config().microbreakInterval === 2400000 && config().longBreakInterval === 3600000, '40minute mini and60minute long save independently')
  await capture('independent-40-60')
  await choose('longBreakFor', '10')
  verify(config().breakDuration === 600000, 'custom long duration persists')
  prefs.reload(); await delay(700)
  verify(await js("document.querySelector('#miniBreakFor').value === '70' && document.querySelector('#longBreakEvery').value === '60'"), 'custom values restore after renderer reload')
  const layouts = []
  for (const language of ['zh-CN', 'en']) {
    await js(`window.settings.saveSettings('language', '${language}')`)
    await delay(400)
    for (const theme of ['light', 'dark']) {
      nativeTheme.themeSource = theme
      for (const [width, height, zoom] of [[860, 740, 1], [620, 680, 1], [760, 700, 1.25]]) {
        prefs.setSize(width, height); prefs.webContents.setZoomFactor(zoom)
        await js("document.querySelector('[data-section=schedule]').click()")
        for (const id of ['miniBreakEvery', 'miniBreakFor', 'longBreakEvery', 'longBreakFor']) {
          await js(`document.querySelector('#${id}').scrollIntoView({ block: '${id === 'longBreakFor' ? 'end' : 'center'}' }); document.querySelector('[data-editor-for=${id}] [data-presets]').click()`)
          await delay(150)
          const measure = await js(`(() => { const p = document.querySelector('.schedule-popover'); const a = document.querySelector('[data-editor-for=${id}] .schedule-input-shell').getBoundingClientRect(); const r = p.getBoundingClientRect(); return { open: p.matches(':popover-open'), width: r.width, height: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom, anchorTop: a.top, anchorBottom: a.bottom, placement: p.dataset.placement, viewportWidth: innerWidth, viewportHeight: innerHeight, presetCount: p.querySelectorAll('[data-preset-value]').length, title: document.querySelector('.schedule h1').textContent, overflow: document.querySelector('.schedule').scrollWidth > document.querySelector('.schedule').clientWidth } })()`)
          verify(measure.open, `${id}: native popover is actually open`)
          verify(measure.top >= 7 && measure.bottom <= measure.viewportHeight - 7 && measure.left >= 7 && measure.right <= measure.viewportWidth - 7 && measure.height <= 281 && measure.presetCount <= 8 && !measure.overflow, `${language}/${theme}/${width}/${zoom}/${id}: panel bounded and no page overflow`)
          const gap = measure.placement === 'above' ? measure.anchorTop - measure.bottom : measure.top - measure.anchorBottom
          if (Math.abs(gap - 8) >= 2) console.log('PANEL_GAP_FAILURE', JSON.stringify(measure), gap)
          verify(Math.abs(gap - 8) < 2, 'panel stays eight pixels from triggering control')
          layouts.push({ language, theme, width, height, zoom, id, ...measure })
          if ((width === 860 && theme === 'light') || (zoom > 1 && theme === 'dark')) await capture(`panel-${id}-${language}-${theme}-${width}-${zoom}`)
          // Test real scroll and window resizing while open, not only initial placement.
          await js("document.querySelector('.schedule').scrollTop += 8")
          await delay(40)
          prefs.setSize(width - 10, height)
          await delay(40)
          const after = await js("(() => { const p = document.querySelector('.schedule-popover'); const r = p.getBoundingClientRect(); return p.hidden || (r.left >= 7 && r.right <= innerWidth - 7 && r.top >= 7 && r.bottom <= innerHeight - 7) })()")
          verify(after, 'scroll and resize keep visible panel within viewport')
          await js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
          verify(await js("document.querySelector('.schedule-popover').hidden"), 'Escape closes presets')
          prefs.setSize(width, height)
        }
      }
    }
  }
  // Exercise actual scheduler -> production windows with short test-only intervals.
  prefs.webContents.setZoomFactor(1)
  const set = async (key, value) => {
    await js(`window.settings.saveSettings(${JSON.stringify(key)}, ${JSON.stringify(value)})`)
    await js('window.settings.currentSettings()')
  }
  await set('microbreak', false); await set('break', false)
  for (const [key, value] of Object.entries({ microbreakInterval: 4000, longBreakInterval: 6000, microbreakDuration: 500, breakDuration: 500, microbreakNotification: false, breakNotification: false, naturalBreaks: false, monitorDnd: false, allScreens: false, showBreaksAsRegularWindows: true, silentNotifications: true, miniBreakManualFinish: false, longBreakManualFinish: false })) await set(key, value)
  await set('microbreak', true); await set('break', true)
  const actual = []; const seen = new Set(); const started = Date.now()
  while (Date.now() - started < 13000 && actual.length < 3) {
    const windows = BrowserWindow.getAllWindows().filter(win => /\/(microbreak|break)\.html$/.test(win.webContents.getURL()))
    verify(windows.length <= 1, 'real short and long reminder windows never overlap')
    for (const win of windows) {
      if (seen.has(win.id) || win.webContents.isLoading()) continue
      seen.add(win.id)
      const type = win.webContents.getURL().endsWith('/microbreak.html') ? 'mini' : 'long'
      actual.push({ type, elapsed: Date.now() - started })
      writeFileSync(join(evidence, `actual-${actual.length}-${type}.png`), (await win.webContents.capturePage()).toPNG())
    }
    await delay(40)
  }
  verify(JSON.stringify(actual.map(e => e.type)) === JSON.stringify(['mini', 'long', 'mini']), 'actual production scheduler emits mini then independent long then reset mini')
  verify(actual[1].elapsed < 8500, 'long deadline is not rounded up to a second four-second mini interval')
  verify(actual[2].elapsed - actual[1].elapsed >= 4000, 'long break completion restarts mini cadence without immediate catch-up')
  writeFileSync(join(evidence, 'real-window-cadence.json'), JSON.stringify(actual, null, 2))
  writeFileSync(join(evidence, 'macos-acceptance.json'), JSON.stringify({ profile, checks, layouts, platform: process.platform, versions: process.versions }, null, 2))
  console.log('MACOS_SCHEDULE_V3_PASSED', checks.length, layouts.length)
  app.exit(0)
}).catch(error => { writeFileSync(join(evidence, 'macos-failure.json'), JSON.stringify({ checks, error: error.stack }, null, 2)); console.error(error); app.exit(1) })
