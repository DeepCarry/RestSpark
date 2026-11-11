// Runs the production Electron windows and IPC with a disposable profile.
import { app, BrowserWindow, powerMonitor, nativeTheme, Tray, screen, dialog } from 'electron'
import DndManager from '../app/utils/dndManager.js'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const evidence = process.env.REST_PRD_EVIDENCE || mkdtempSync(join(tmpdir(), 'rest-spark-prd-evidence-'))
const profile = process.env.REST_PRD_PROFILE || mkdtempSync(join(tmpdir(), 'rest-spark-prd-profile-'))
const stage = process.argv.at(-1)
mkdirSync(evidence, { recursive: true })
app.setPath('userData', profile)
app.setPath('logs', join(profile, 'logs'))
if (['p0', 'p1', 'preview', 'probe', 'strict', 'recovery', 'feedback'].includes(stage)) {
  writeFileSync(join(profile, 'config.json'), JSON.stringify({
    isFirstRun: false,
    _migratedOpenAtLogin: true,
    openAtLogin: false,
    disableAppUpdateFeatures: true,
    language: 'zh-CN',
    themeSource: 'light',
    naturalBreaks: false,
    monitorDnd: true,
    morningHour: 7,
    microbreakDuration: stage === 'strict' ? 5000 : 30000,
    microbreakStrictMode: stage === 'strict',
    microbreakPostpone: stage !== 'strict',
    microbreakInterval: stage === 'preview' ? 14500 : 20 * 60000,
    longBreakInterval: 55 * 60000,
    microbreakPostponeTime: 1600,
    allScreens: true,
    qaUnknownField: 'preserved'
  }))
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const config = () => JSON.parse(readFileSync(join(profile, 'config.json'), 'utf8'))
const command = (...args) => app.emit('second-instance', {}, [], '', args)
const windows = page => BrowserWindow.getAllWindows().filter(win => win.webContents.getURL().endsWith(`/${page}.html`))
const waitFor = async (predicate, description) => {
  for (let count = 0; count < 100; count++) {
    const result = await predicate()
    if (result) return result
    await delay(80)
  }
  throw new Error(description)
}
const visible = page => waitFor(() => windows(page).find(win => win.isVisible()), `${page} visible`)
const evaluate = (win, expression) => win.webContents.executeJavaScript(expression)
const capture = async (win, name) => {
  await delay(120)
  const image = await win.webContents.capturePage()
  assert.ok(!image.isEmpty(), `${name} capture`)
  writeFileSync(join(evidence, `${name}.png`), image.toPNG())
}

if (stage === 'onboarding') {
  writeFileSync(join(profile, 'config.json'), JSON.stringify({
    isFirstRun: true,
    _migratedOpenAtLogin: true,
    openAtLogin: false,
    disableAppUpdateFeatures: true,
    language: 'zh-CN',
    themeSource: 'light'
  }))
}
let tray
let simulatedFocus = false
if (['p1', 'feedback'].includes(stage)) {
  const originalOn = Tray.prototype.on
  Tray.prototype.on = function (event, listener) {
    tray = this
    return originalOn.call(this, event, listener)
  }
  DndManager.prototype._doNotDisturb = async () => simulatedFocus
}

if (stage === 'recovery') {
  const load = BrowserWindow.prototype.loadURL
  let fail = true
  BrowserWindow.prototype.loadURL = function (url, ...args) {
    if (fail && url.endsWith('/microbreak.html')) {
      fail = false
      return Promise.reject(new Error('Intentional QA renderer load failure'))
    }
    return load.call(this, url, ...args)
  }
  dialog.showMessageBox = async () => ({ response: 0 })
}

await import('../app/main.js')
app.whenReady().then(async () => {
  await waitFor(() => windows('process').length, 'main process window')
  await delay(600)
  if (stage === 'onboarding') {
    const welcome = await visible('welcome')
    await capture(welcome, 'UI-01-onboarding-mode')
    await evaluate(welcome, 'document.querySelector("[value=deep]").click(); document.querySelector("#next").click()')
    await waitFor(() => evaluate(welcome, '!document.querySelector("#prefs").hidden && document.querySelector("#chosen-preset").textContent.includes("50")'), 'deep work preview')
    await capture(welcome, 'UI-02-onboarding-preferences')
    await evaluate(welcome, 'document.querySelector("#complete").click()')
    await waitFor(() => welcome.isDestroyed(), 'completed onboarding closes')
    assert.equal(config().microbreak, false)
    assert.equal(config().longBreakInterval, 3000000)
    assert.equal(config().breakDuration, 600000)
    assert.equal(config().onboardingVersion, 1)
    assert.equal(config().openAtLogin, false)
  } else {
    assert.equal(windows('welcome').length, 0, 'upgraded profile bypasses onboarding')
    assert.equal(config().morningHour, 7)
    assert.equal(config().longBreakInterval, 55 * 60000)
    assert.equal(config().qaUnknownField, 'preserved')
  }

  if (stage === 'p0') {
    command('mini')
    const mini = await visible('microbreak')
    assert.equal(await evaluate(mini, '!document.querySelector("#postpone").disabled && !document.querySelector("#close").disabled'), true)
    await evaluate(mini, 'document.querySelector("#postpone").click(); window.breaks.postponeBreak(); window.breaks.finishBreak(false)')
    await waitFor(() => mini.isDestroyed(), 'all first mini windows close')
    const repeated = await visible('microbreak')
    assert.equal(await evaluate(repeated, 'document.querySelector("#postpone").disabled && !document.querySelector("#close").disabled'), true)
    await capture(repeated, 'short-postponed-limit')
    await evaluate(repeated, 'document.querySelector("#close").click()')
    await waitFor(() => repeated.isDestroyed(), 'skip closes current break')
    command('preferences')
    const preferences = await visible('preferences')
    await evaluate(preferences, 'window.settings.saveSettings("microbreakPostponeTime", 120000)')
    await waitFor(() => config().microbreakPostponeTime === 120000, 'standard postpone interval')
    preferences.close()
    command('mini')
    const ordinary = await visible('microbreak')
    await capture(ordinary, 'UI-07-short-light')
    await evaluate(ordinary, 'document.querySelector("#close").click()')
    await waitFor(() => ordinary.isDestroyed(), 'normal mini skipped')
    nativeTheme.themeSource = 'dark'
    command('long')
    const long = await visible('break')
    await capture(long, 'UI-08-long-dark')
    await evaluate(long, 'document.querySelector("#close").click()')
    await waitFor(() => long.isDestroyed(), 'long break skipped')
    command('pause', '--duration', '1h')
    await waitFor(() => config().manualPauseUntil > Date.now(), 'persistent pause deadline')
    powerMonitor.emit('lock-screen')
    powerMonitor.emit('suspend')
    powerMonitor.emit('unlock-screen')
    powerMonitor.emit('resume')
    await delay(200)
    assert.ok(config().manualPauseUntil > Date.now(), 'wake and unlock preserve manual deadline')
  } else if (stage === 'p1') {
    assert.ok(tray, 'native tray exists')
    tray.emit('click')
    const panel = await visible('tray-popover')
    for (const event of ['focus', 'blur', 'show', 'hide']) {
      panel.on(event, () => console.log('PANEL', event))
    }
    const status = text => waitFor(() => evaluate(panel, `document.querySelector("#status").textContent.includes(${JSON.stringify(text)})`), text)
    const click = selector => evaluate(panel, `document.querySelector(${JSON.stringify(selector)}).click()`)
    await status('距离下一次休息')
    await capture(panel, 'UI-03-tray-running')
    await click('#pause')
    await waitFor(() => evaluate(panel, 'document.querySelectorAll("#choices button").length === 5'), 'five pause choices')
    await capture(panel, 'UI-04-tray-pause-options')
    await click('#choices button:nth-child(3)')
    await status('已暂停')
    assert.ok(Math.abs(config().manualPauseUntil - Date.now() - 10800000) < 5000)
    await capture(panel, 'UI-05-tray-manual-paused')
    simulatedFocus = true
    await waitFor(() => evaluate(panel, 'document.querySelector("#detail").textContent.includes("系统勿扰中")'), 'stacked manual and Focus reasons')
    await click('#resume')
    await status('系统勿扰中')
    await capture(panel, 'UI-06-tray-focus-simulated')
    await click('#rest')
    const mini = await visible('microbreak')
    await evaluate(mini, 'document.querySelector("#close").click()')
    await waitFor(() => mini.isDestroyed(), 'manual break is allowed under Focus')
    simulatedFocus = false
    await delay(1250)
    tray.emit('click')
    await visible('tray-popover')
    await status('距离下一次休息')
    nativeTheme.themeSource = 'dark'
    await capture(panel, 'tray-dark')
    if (!panel.isVisible()) {
      tray.emit('click')
      await visible('tray-popover')
    }
    assert.equal(await evaluate(panel, 'window.popover.action("settings")'), true, 'settings action accepted')
    const preferences = await visible('preferences')
    await evaluate(preferences, 'document.querySelector("[data-section=settings]").click()')
    await waitFor(() => evaluate(preferences, 'document.querySelector("#morningHour").value === "7"'), 'existing morning preference')
    await evaluate(preferences, 'document.querySelector("#morningHour").scrollIntoView({block: "center"})')
    await capture(preferences, 'UI-10-settings')
    await evaluate(preferences, 'window.settings.saveSettings("language", "en")')
    await delay(300)
    preferences.close()
    tray.emit('click')
    await visible('tray-popover')
    await status('Time until your next break')
    for (const width of [320, 400]) {
      panel.setSize(width, 420)
      await delay(160)
      assert.equal(await evaluate(panel, 'document.querySelector(".popover-surface").scrollWidth <= innerWidth'), true)
      await capture(panel, `tray-en-dark-${width}pt`)
    }
  } else if (stage === 'feedback') {
    tray.emit('click')
    const panel = await visible('tray-popover')
    await waitFor(() => evaluate(panel, 'document.querySelector("#pause").textContent === "暂停提醒"'), 'localized pause button')
    panel.webContents.debugger.attach('1.3')
    try {
      const cdp = panel.webContents.debugger
      await cdp.sendCommand('DOM.enable')
      await cdp.sendCommand('CSS.enable')
      const { root } = await cdp.sendCommand('DOM.getDocument')
      const { nodeId } = await cdp.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: '#pause' })
      const fonts = await cdp.sendCommand('CSS.getPlatformFontsForNode', { nodeId })
      const weight = await evaluate(panel, 'getComputedStyle(document.querySelector("#pause")).fontWeight')
      console.log('PAUSE_FONT', JSON.stringify({ ...fonts, weight }))
      assert.equal(weight, '500')
    } finally {
      panel.webContents.debugger.detach()
    }
    await capture(panel, 'pause-button')
    panel.hide()

    command('preferences')
    const prefs = await visible('preferences')
    await evaluate(prefs, 'document.querySelector("[data-section=theme]").click()')
    for (const width of [860, 620]) {
      prefs.setSize(width, 740)
      await waitFor(() => evaluate(prefs, '[...document.querySelectorAll(".appearance-preview img")].every(image => image.complete && image.naturalWidth > 0)'), 'approved previews loaded')
      const fit = await evaluate(prefs, '[...document.querySelectorAll(".appearance-preview img")].map(image => getComputedStyle(image).objectFit)')
      assert.deepEqual(fit, ['contain', 'contain', 'contain', 'contain'])
      await capture(prefs, `appearance-${width}`)
    }
    prefs.setSize(860, 740)
    await evaluate(prefs, 'document.querySelector("label[for=appearance-dark]").click()')
    await waitFor(() => evaluate(prefs, 'matchMedia("(prefers-color-scheme: dark)").matches'), 'dark appearance applied')
    await capture(prefs, 'appearance-dark')
    await evaluate(prefs, 'document.querySelector("label[for=appearance-light]").click()')
    await waitFor(() => evaluate(prefs, '!matchMedia("(prefers-color-scheme: dark)").matches'), 'light appearance restored')
    await evaluate(prefs, 'document.querySelector("[data-section=settings]").click()')
    await evaluate(prefs, 'document.querySelector("#view-onboarding").scrollIntoView({ block: "center" })')
    await capture(prefs, 'onboarding-entry')
    const before = config()
    await evaluate(prefs, 'document.querySelector("#view-onboarding").click()')
    const welcome = await visible('welcome')
    await capture(welcome, 'onboarding-preview-step-1')
    await evaluate(welcome, 'document.querySelector("[value=deep]").click(); document.querySelector("#next").click()')
    await waitFor(() => evaluate(welcome, 'document.querySelector("#complete").textContent === "完成预览" && !document.querySelector("#prefs").hidden'), 'preview completion')
    await capture(welcome, 'onboarding-preview-step-2')
    await evaluate(welcome, 'document.querySelector("#login").click(); document.querySelector("#complete").click()')
    await waitFor(() => welcome.isDestroyed(), 'preview closes')
    assert.deepEqual(config(), before, 'reviewing onboarding does not write existing settings')
  } else if (stage === 'recovery') {
    command('mini')
    await delay(700)
    assert.equal(windows('microbreak').length, 0)
    command('mini')
    const mini = await visible('microbreak')
    command('preferences')
    const preferences = await visible('preferences')
    await evaluate(preferences, 'window.stretchly.restoreDefaults()')
    await waitFor(() => mini.isDestroyed(), 'restoring defaults closes the active reminder')
    command('mini')
    const afterRestore = await visible('microbreak')
    await evaluate(afterRestore, 'document.querySelector("#close").click()')
    await waitFor(() => afterRestore.isDestroyed(), 'reminders still run after restoring defaults')
  } else if (stage === 'strict') {
    command('mini')
    const mini = await visible('microbreak')
    assert.equal(await evaluate(mini, 'document.querySelector("#close").disabled && document.querySelector("#postpone").disabled'), true)
    await capture(mini, 'short-strict')
    await evaluate(mini, 'window.breaks.finishBreak(true); window.breaks.postponeBreak()')
    command('long')
    await delay(300)
    assert.equal(mini.isDestroyed(), false, 'renderer and CLI cannot bypass strict break')
    assert.equal(windows('break').length, 0)
    await waitFor(() => mini.isDestroyed(), 'strict rest finishes normally')
  } else if (stage === 'preview') {
    const captureBanner = process.env.REST_PRD_CAPTURE_BANNER
    let backdrop
    if (captureBanner) {
      const { x, y, width } = screen.getPrimaryDisplay().bounds
      backdrop = new BrowserWindow({ x: x + width - 460, y: y + 24, width: 460, height: 144, frame: false, backgroundColor: '#e3f2ee' })
      await backdrop.loadURL('about:blank')
    }
    const renderer = windows('process')[0]
    await evaluate(renderer, `(() => {
      const NativeNotification = window.Notification
      window.previewEvidence = { permission: NativeNotification.permission, notifications: [], closeCalls: 0 }
      window.Notification = class extends NativeNotification {
        constructor (title, options) {
          super(title, options)
          const event = { title, body: options.body, shown: false, closed: false }
          window.previewEvidence.notifications.push(event)
          this.addEventListener('show', () => { event.shown = true })
          this.addEventListener('close', () => { event.closed = true })
        }

        close () {
          window.previewEvidence.closeCalls++
          return super.close()
        }
      }
    })()`)
    const preview = await waitFor(() => evaluate(renderer, 'window.previewEvidence.notifications[0]'), 'gentle preview sent to native Notification')
    assert.match(preview.title, /10 秒后短休息/)
    assert.match(preview.body, /远眺/)
    await waitFor(() => evaluate(renderer, 'window.previewEvidence.notifications[0].shown'), 'native notification show event')
    if (captureBanner) {
      await delay(750)
      const { x, y, width } = screen.getPrimaryDisplay().bounds
      execFileSync('/usr/sbin/screencapture', ['-x', `-R${x + width - 460},${y + 24},460,144`, captureBanner])
      backdrop.close()
    }
    command('pause', '--duration', '1h')
    await waitFor(() => evaluate(renderer, 'window.previewEvidence.closeCalls === 1'), 'preview withdrawn on pause')
    await delay(10500)
    const evidenceResult = await evaluate(renderer, 'window.previewEvidence')
    writeFileSync(join(evidence, 'UI-09-notification-events.json'), JSON.stringify(evidenceResult, null, 2))
    assert.equal(windows('microbreak').length, 0)
  } else if (stage === 'probe') {
    const probePath = process.env.REST_PRD_PROBE
    const win = new BrowserWindow({ width: 480, height: 320 })
    await win.loadURL('data:text/html,<title>Rest Spark probe</title>')
    win.focus()
    const probe = () => JSON.parse(execFileSync(probePath, [String(process.pid)], { encoding: 'utf8' }))
    await delay(250)
    const regular = probe()
    win.setFullScreen(true)
    await waitFor(() => win.isFullScreen(), 'fullscreen transition')
    await delay(1400)
    const fullscreen = probe()
    const geometryDistinguished = regular.fullDisplayCandidateWindows === 0 && fullscreen.fullDisplayCandidateWindows === 1
    const result = { regular, fullscreen, geometryDistinguished, electronFullscreen: win.isFullScreen() }
    writeFileSync(join(evidence, 'presentation-probe.json'), JSON.stringify(result, null, 2))
    if (!geometryDistinguished) console.log('FULLSCREEN_GEOMETRY_NOT_DISTINGUISHED', result)
  } else if (stage === 'restart') {
    assert.ok(config().manualPauseUntil > Date.now(), 'deadline survives app relaunch')
    command('resume')
    await waitFor(() => config().manualPauseUntil === 0, 'manual resume clears persisted deadline')
  }
  console.log('REST_PRD_PASS', stage, evidence, profile)
  app.exit(0)
}).catch(error => {
  console.error(error)
  app.exit(1)
})
