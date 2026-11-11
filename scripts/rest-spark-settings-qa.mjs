// Actual macOS Electron UI with production preload/IPC and a disposable profile.
import { app, BrowserWindow, nativeTheme, dialog } from 'electron'
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
const root = resolve(import.meta.dirname, '..')
const evidence = process.env.REST_SETTINGS_EVIDENCE || join(root, 'docs/rest-spark/settings-v1/evidence')
const baseline = process.argv.includes('--baseline')
const profile = mkdtempSync(join(tmpdir(), 'restspark-settings-'))
mkdirSync(evidence, { recursive: true })
app.setPath('userData', profile)
app.setPath('logs', join(profile, 'logs'))
writeFileSync(join(profile, 'config.json'), JSON.stringify({ isFirstRun: false, language: 'zh-CN', disableAppUpdateFeatures: baseline, checkNewVersion: false, openAtLogin: false, _migratedOpenAtLogin: true, naturalBreaks: false, monitorDnd: false, mainColor: '#633738', microbreakInterval: 900000, microbreakDuration: 25000, manualField: { preserved: true } }))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
await import('../app/main.js')
app.whenReady().then(async () => {
  await delay(2200)
  app.emit('second-instance', {}, [], root, ['preferences'])
  let prefs
  for (let n = 0; n < 100; n++) {
    prefs = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/preferences.html'))
    if (prefs && !prefs.webContents.isLoading()) break
    await delay(100)
  }
  assert.ok(prefs, 'preferences window loads')
  const js = code => prefs.webContents.executeJavaScript(code)
  await delay(1000)
  prefs.setSize(860, 740)
  nativeTheme.themeSource = 'light'
  for (const page of ['settings', 'schedule', 'theme', 'about']) {
    await js(`document.querySelector('[data-section=${page}]').click()`)
    prefs.show(); prefs.focus()
    await delay(400)
    writeFileSync(join(evidence, `${baseline ? 'before' : 'after'}-${page}-zh-light.png`), (await prefs.webContents.capturePage()).toPNG())
  }
  const checks = []
  const verify = (ok, name) => { assert.ok(ok, name); checks.push(name) }
  if (!baseline) {
    const config = () => JSON.parse(readFileSync(join(profile, 'config.json')))
    verify(config().mainColor === '#478484' && config().settingsThemeBackup.mainColor === '#633738', 'legacy theme migrated with backup')
    verify(config().manualField.preserved, 'unknown user fields retained')
    verify(await js("document.querySelectorAll('[name=mainColor]').length === 0"), 'no retired theme choices')
    for (const [id, key] of [['openAtLogin', 'openAtLogin'], ['showIdeas', 'ideas'], ['allScreens', 'allScreens'], ['monitorIdleTime', 'naturalBreaks'], ['monitorDnd', 'monitorDnd'], ['enableTransparency', 'transparentMode'], ['enableSounds', 'silentNotifications'], ['enableStrictMini', 'microbreakStrictMode'], ['enableStrictLong', 'breakStrictMode'], ['showNotificationBeforeMiniBreak', 'microbreakNotification'], ['showNotificationBeforeLongBreak', 'breakNotification'], ['enablePostponeMini', 'microbreakPostpone'], ['enablePostponeLong', 'breakPostpone']]) {
      // Do not change macOS login items even in QA; just verify its loaded state.
      if (key === 'openAtLogin') { verify(await js("document.querySelector('#openAtLogin').checked === false"), 'login setting loaded'); continue }
      const before = config()[key]
      await js(`document.querySelector('#${id}').click()`)
      await delay(180)
      verify(config()[key] === !before, `real toggle persistence: ${key}`)
      await js(`document.querySelector('#${id}').click()`)
      await delay(180)
      verify(config()[key] === before, `toggle can restore: ${key}`)
    }
    for (const [id, value, key, expected] of [['miniBreakEvery', '20', 'microbreakInterval', 1200000], ['miniBreakFor', '80', 'microbreakDuration', 80000], ['longBreakEvery', '60', 'longBreakInterval', 3600000], ['longBreakFor', '6', 'breakDuration', 360000], ['trayIconStyle', 'time', 'trayIconStyle', 'time'], ['trayIconStyle', 'progress', 'trayIconStyle', 'progress']]) {
      await js(`(() => { const input = document.querySelector('#${id}'); input.value = '${value}'; input.dispatchEvent(new Event(input.type === 'number' ? 'input' : 'change')); if (input.type === 'number') input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`)
      await delay(250)
      verify(config()[key] === expected, `real selector persistence: ${key} = ${expected}`)
    }
    verify(await js("document.querySelector('#longBreakEvery-value').textContent.includes('60')"), 'long interval displays independent minutes')
    for (const audio of ['crystal-glass', 'wind-chime', 'tic-toc', 'reverie']) {
      await js(`document.querySelector('input[value="${audio}"]').click(); document.querySelector('[data-preview-sound="${audio}"]').click()`)
      await delay(150)
      verify(config().longBreakAudio === audio && config().miniBreakAudio === audio, `real audio selection: ${audio}`)
    }
    prefs.reload()
    await delay(1000)
    verify(await js("document.querySelector('#miniBreakFor').value === '80'"), 'saved duration survives renderer restart')
    await js("document.querySelector('[data-section=about]').click(); document.querySelector('#licenses').open = true")
    await delay(150)
    writeFileSync(join(evidence, 'after-license.png'), (await prefs.webContents.capturePage()).toPNG())
    await js("document.querySelector('#licenses').open = false; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true }))")
    await delay(300)
    verify(await js("!document.querySelector('.debug > div').classList.contains('hidden')"), 'debug shortcut exposes real diagnostic information')
    await js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true }))")
    const layouts = []
    for (const language of ['zh-CN', 'en']) {
      await js(`window.settings.saveSettings('language', '${language}')`)
      await delay(600)
      for (const mode of ['light', 'dark']) {
        nativeTheme.themeSource = mode
        for (const [width, height, zoom] of [[860, 740, 1], [760, 700, 1], [620, 680, 1], [760, 700, 1.25]]) {
          prefs.setSize(width, height)
          prefs.webContents.setZoomFactor(zoom)
          for (const section of ['settings', 'schedule', 'theme', 'about']) {
            await js(`document.querySelector('[data-section=${section}]').click()`)
            await delay(100)
            const layout = await js(`(() => { const page = document.querySelector('.${section}'); return { pageWidth: page.clientWidth, contentWidth: page.scrollWidth, windowWidth: innerWidth, documentWidth: document.documentElement.scrollWidth, title: page.querySelector('h1').textContent, font: getComputedStyle(page.querySelector('h1')).fontFamily, fontSize: getComputedStyle(page.querySelector('h1')).fontSize, clipped: Array.from(page.querySelectorAll('select, button, .switch-track')).filter(e => e.getBoundingClientRect().width > 0 && (e.getBoundingClientRect().right > innerWidth + 1 || e.getBoundingClientRect().left < 0)).length } })()`)
            verify(layout.pageWidth + 1 >= layout.contentWidth && layout.documentWidth <= layout.windowWidth && layout.clipped === 0, `${language}/${mode}/${width}/${zoom}/${section}: no horizontal overflow or clipped controls`)
            verify(layout.fontSize === '24px' && layout.font.includes('PingFang'), 'specified title typography')
            layouts.push({ language, mode, width, height, zoom, section, ...layout })
            if (width === 860 || (width === 620 && language === 'en') || zoom > 1) {
              writeFileSync(join(evidence, `after-${section}-${language}-${mode}-${width}-${zoom}.png`), (await prefs.webContents.capturePage()).toPNG())
            }
          }
        }
      }
    }
    await js("document.querySelector('[data-section=schedule]').click(); window.alert = () => {}; document.querySelector('#enableMiniBreaks').click(); document.querySelector('#enableLongBreaks').click()")
    await delay(200)
    verify(!config().microbreak && config().break, 'cannot persist both break types disabled')
    const snapshot = readFileSync(join(profile, 'config.json'), 'utf8')
    const originalDialog = dialog.showMessageBox
    let confirmation
    dialog.showMessageBox = async options => { confirmation = options; return { response: 1 } }
    await js("document.querySelector('#restore-defaults').click()")
    await delay(250)
    verify(confirmation.type === 'question' && confirmation.buttons.length === 2, 'restore asks for confirmation using real IPC')
    verify(readFileSync(join(profile, 'config.json'), 'utf8') === snapshot, 'cancel restore preserves settings byte-for-byte')
    dialog.showMessageBox = async () => ({ response: 0 })
    await js("document.querySelector('#restore-defaults').click()")
    await delay(1000)
    dialog.showMessageBox = originalDialog
    verify(config().microbreak && config().break && config().microbreakDuration === 30000, 'confirmed restore reloads real default settings')
    verify(await js("document.querySelector('#miniBreakFor').value === '30'"), 'restored defaults bind after reload')
    writeFileSync(join(evidence, 'layout-matrix.json'), JSON.stringify(layouts, null, 2))
    writeFileSync(join(evidence, 'acceptance.json'), JSON.stringify({ checks, platform: process.platform, profile }, null, 2))
  }
  writeFileSync(join(evidence, `${baseline ? 'before' : 'after'}-runtime.json`), JSON.stringify({ profile, platform: process.platform, versions: process.versions, config: JSON.parse(readFileSync(join(profile, 'config.json'))) }, null, 2))
  console.log('SETTINGS_CAPTURE_PASSED', profile)
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
