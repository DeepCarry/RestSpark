// Isolated macOS QA: runs the actual application and production preload/IPC.
import { app, BrowserWindow, nativeTheme, nativeImage } from 'electron'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'

const baseline = process.argv.includes('--baseline')
const checks = []
const verify = (condition, name) => { assert.ok(condition, name); checks.push(name) }
const root = resolve(import.meta.dirname, '..')
const evidence = process.env.REST_LAYOUT_EVIDENCE || join(root, 'docs/quiet-rest/evidence')
const profile = join(tmpdir(), `stretchly-quiet-rest-qa-${Date.now()}`)
mkdirSync(profile, { recursive: true })
mkdirSync(evidence, { recursive: true })
const portrait = nativeImage.createFromPath(join(root, 'app/images/quiet-rest/stretch.png'))
const pixels = portrait.toBitmap()
const { width: pw, height: ph } = portrait.getSize()
const bounds = { left: pw, top: ph, right: -1, bottom: -1 }
for (let y = 0; y < ph; y++) {
  for (let x = 0; x < pw; x++) {
    if (pixels[(y * pw + x) * 4 + 3] > 0) {
      bounds.left = Math.min(bounds.left, x); bounds.top = Math.min(bounds.top, y)
      bounds.right = Math.max(bounds.right, x); bounds.bottom = Math.max(bounds.bottom, y)
    }
  }
}
writeFileSync(join(evidence, 'portrait-alpha.json'), JSON.stringify({ width: pw, height: ph, bounds }, null, 2))
app.setPath('userData', profile)
app.setPath('logs', join(profile, 'logs'))
writeFileSync(join(profile, 'config.json'), JSON.stringify({
  isFirstRun: false,
  language: 'zh-CN',
  disableAppUpdateFeatures: true,
  checkNewVersion: false,
  notifyNewVersion: false,
  openAtLogin: false,
  naturalBreaks: false,
  monitorDnd: false,
  allScreens: false,
  silentNotifications: true,
  miniBreakAudio: 'silence',
  longBreakAudio: 'silence',
  showBreaksAsRegularWindows: true,
  microbreakDuration: 20000,
  breakDuration: 300000
}))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const command = (...args) => app.emit('second-instance', {}, [], root, args)
async function page (name) {
  for (let n = 0; n < 100; n++) {
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith(`/${name}.html`))
    if (win && !win.webContents.isLoading()) {
      await delay(600)
      return win
    }
    await delay(100)
  }
  throw new Error(`Window did not load: ${name}`)
}
async function capture (win, name) {
  await delay(300)
  writeFileSync(join(evidence, `${name}.png`), (await win.webContents.capturePage()).toPNG())
}
await import('../app/main.js')
app.whenReady().then(async () => {
  await delay(2000)
  nativeTheme.themeSource = 'light'
  command('preferences')
  const prefs = await page('preferences')
  await prefs.webContents.executeJavaScript("document.querySelector('[data-section=schedule]').click()")
  await capture(prefs, baseline ? 'before-schedule' : 'after-schedule-zh-light')
  if (!baseline) {
    await prefs.webContents.executeJavaScript("document.querySelector('[data-strict-mode]').scrollIntoView()")
    await capture(prefs, 'after-schedule-zh-lower')
    await prefs.webContents.executeJavaScript('window.scrollTo(0, 0)')
    nativeTheme.themeSource = 'dark'
    await capture(prefs, 'after-schedule-zh-dark')
    nativeTheme.themeSource = 'light'
  }
  command('mini', '-T', '让眼睛放松一下')
  const mini = await page('microbreak')
  await layoutMatrix(mini, 'microbreak')
  await capture(mini, baseline ? 'before-microbreak' : 'after-microbreak-zh-light')
  await mini.webContents.executeJavaScript('window.breaks.finishBreak(false)')
  await delay(800)
  command('long', '-T', '起身，舒展一下', '-t', '离开屏幕，让身体和思绪一起放松。')
  const long = await page('break')
  await layoutMatrix(long, 'long-break')
  await capture(long, baseline ? 'before-long-break' : 'after-long-break-zh-light')
  if (!baseline) { nativeTheme.themeSource = 'dark'; await capture(long, 'after-long-break-zh-dark'); nativeTheme.themeSource = 'light' }
  if (!baseline && !process.argv.includes('--layout-only')) await acceptance(prefs, long)
  writeFileSync(join(evidence, 'macos-qa.json'), JSON.stringify({ baseline, profile, versions: process.versions, platform: process.platform, checks }, null, 2))
  console.log('MACOS_QA_PASSED', checks.length, profile)
  app.exit(0)
}).catch(error => {
  writeFileSync(join(evidence, 'macos-qa-failure.json'), JSON.stringify({ profile, checks, error: error.stack }, null, 2))
  console.error(error)
  app.exit(1)
})

async function acceptance (prefs, long) {
  const js = (win, code) => win.webContents.executeJavaScript(code)
  const hidden = (win, id) => js(win, `document.querySelector('#${id}').classList.contains('hidden')`)
  const disabled = (win, id) => js(win, `document.querySelector('#${id}').disabled`)
  const save = async (key, value) => {
    await js(prefs, `window.settings.saveSettings(${JSON.stringify(key)}, ${JSON.stringify(value)})`)
    await delay(700)
  }
  verify(await js(long, "document.querySelector('.break-idea').textContent.includes('起身')"), 'long break retains sanitized custom idea')
  const first = await js(long, "document.querySelector('#progress').value")
  await delay(400)
  verify(await js(long, "document.querySelector('#progress').value") < first, 'real IPC-started countdown advances')
  verify(!(await hidden(long, 'postpone')) && !(await disabled(long, 'postpone')), 'long postpone is available in configured window')
  await js(long, "document.querySelector('#postpone').click()")
  await delay(700)
  verify(long.isDestroyed(), 'long postpone closes actual window and reschedules')
  for (const [id, value, key, expected] of [
    ['miniBreakFor', '80', 'microbreakDuration', 80000],
    ['miniBreakEvery', '15', 'microbreakInterval', 900000],
    ['longBreakEvery', '60', 'longBreakInterval', 3600000],
    ['longBreakFor', '6', 'breakDuration', 360000]
  ]) {
    await js(prefs, `(() => { const input = document.querySelector('#${id}'); input.value = '${value}'; input.dispatchEvent(new Event(input.type === 'number' ? 'input' : 'change')); if (input.type === 'number') input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`)
    await delay(700)
    verify(JSON.parse(readFileSync(join(profile, 'config.json')))[key] === expected, `real settings persistence: ${key}`)
  }
  await js(prefs, "document.querySelector('#showNotificationBeforeMiniBreak').click()")
  await delay(700)
  verify(JSON.parse(readFileSync(join(profile, 'config.json'))).microbreakNotification === false, 'notification toggle persists')
  for (const section of ['settings', 'theme', 'about', 'schedule']) {
    await js(prefs, `document.querySelector('[data-section=${section}]').click()`)
    verify(await js(prefs, `!document.querySelector('body > .${section}').classList.contains('hidden')`), `original section remains accessible: ${section}`)
  }
  verify(await js(prefs, "document.querySelector('[data-section=heart]').hidden"), 'upstream support remains hidden from settings navigation')
  // Reload reads stored settings through the actual preload again.
  prefs.reload()
  await delay(1000)
  verify(await js(prefs, "document.querySelector('#miniBreakFor').value") === '80', 'persisted duration survives window reload')
  await save('language', 'en')
  await delay(500)
  await capture(prefs, 'after-schedule-en-light')
  nativeTheme.themeSource = 'dark'
  await capture(prefs, 'after-schedule-en-dark')
  prefs.setSize(620, 680)
  await js(prefs, "document.querySelector('[data-section=theme]').click(); document.querySelector('[data-section=schedule]').click()")
  verify(prefs.getSize()[0] === 620, 'navigation preserves user-resized window')
  await capture(prefs, 'after-schedule-narrow-dark')
  verify(await js(prefs, 'document.documentElement.scrollWidth <= innerWidth'), 'narrow schedule has no horizontal page overflow')
  prefs.setSize(860, 740)
  nativeTheme.themeSource = 'light'
  await save('microbreakDuration', 2000)
  await save('microbreakPostpone', false)
  await save('microbreakStrictMode', true)
  await save('miniBreakManualFinish', true)
  command('mini', '-T', 'Rest your eyes')
  let mini = await page('microbreak')
  verify(await js(mini, "document.querySelector('.microbreak-idea').textContent === 'Rest your eyes'"), 'mini array payload produces visible sanitized text')
  verify(await disabled(mini, 'close'), 'strict mini disables early skip')
  verify(await hidden(mini, 'finish'), 'manual finish hidden until duration completes')
  await delay(2400)
  verify(!(await hidden(mini, 'finish')), 'real scheduler enters manual-await on completion')
  verify(await hidden(mini, 'close'), 'strict mini stays unskippable during manual-await')
  await capture(mini, 'after-microbreak-manual-finish')
  await js(mini, "document.querySelector('#finish').click()")
  await delay(500)
  verify(mini.isDestroyed(), 'manual finish ends the actual break')
  await save('microbreakDuration', 20000)
  await save('miniBreakManualFinish', false)
  await save('microbreakStrictMode', false)
  command('mini', '-T', 'Rest your eyes')
  mini = await page('microbreak')
  verify(!(await hidden(mini, 'close')) && !(await disabled(mini, 'close')), 'non-strict mini exposes skip when postponing disabled')
  await js(mini, "document.querySelector('#close').focus()")
  verify(await js(mini, "document.activeElement.id === 'close'"), 'native skip button is keyboard focusable')
  await capture(mini, 'after-microbreak-en-light')
  nativeTheme.themeSource = 'dark'
  mini.setSize(600, 620)
  await capture(mini, 'after-microbreak-en-narrow-dark')
  verify(await js(mini, 'document.documentElement.scrollWidth <= innerWidth'), 'narrow mini has no horizontal overflow')
  await js(mini, "document.querySelector('#close').click()")
  await delay(500)
  verify(mini.isDestroyed(), 'skip button ends actual mini break')
  await save('microbreakPostpone', true)
  command('mini', '-T', 'Rest your eyes')
  mini = await page('microbreak')
  await js(mini, "document.querySelector('#postpone').click()")
  await delay(500)
  verify(mini.isDestroyed(), 'mini postpone closes actual window')
  await save('microbreakPostpone', false)
  await save('microbreakDuration', 2000)
  command('mini', '-T', 'Rest your eyes')
  mini = await page('microbreak')
  await delay(2400)
  verify(mini.isDestroyed(), 'mini automatically completes through real scheduler')
  nativeTheme.themeSource = 'light'
  await save('breakDuration', 2000)
  await save('breakPostpone', false)
  await save('breakStrictMode', true)
  await save('longBreakManualFinish', false)
  command('long', '-T', 'Take a breath', '-t', 'Let your shoulders relax.')
  long = await page('break')
  verify(await disabled(long, 'close'), 'strict long disables early skip')
  await delay(2500)
  verify(long.isDestroyed(), 'long automatically completes through the real scheduler')
  await save('longBreakManualFinish', true)
  command('long', '-T', 'Take a breath', '-t', 'Let your shoulders relax.')
  long = await page('break')
  await delay(2300)
  verify(!(await hidden(long, 'finish')), 'long real scheduler enters manual-await')
  await capture(long, 'after-long-break-manual-finish')
  await js(long, "document.querySelector('#finish').click()")
  await delay(500)
  verify(long.isDestroyed(), 'manual finish ends actual long break')
  await save('breakDuration', 300000)
  await save('breakStrictMode', false)
  command('long', '-T', 'Take a breath', '-t', 'Let your shoulders relax.')
  long = await page('break')
  verify(!(await hidden(long, 'close')) && !(await disabled(long, 'close')), 'non-strict long exposes skip')
  await capture(long, 'after-long-break-en-light')
  nativeTheme.themeSource = 'dark'
  long.setSize(600, 620)
  await capture(long, 'after-long-break-en-narrow-dark')
  await js(long, "document.querySelector('#close').click()")
  await delay(500)
  verify(long.isDestroyed(), 'skip ends actual long break')
  // Long safe custom content remains scrollable and actions stay in the document.
  await save('microbreakDuration', 20000)
  command('mini', '-T', '<p>' + 'A moment to breathe and look away. '.repeat(12) + '</p>')
  mini = await page('microbreak')
  mini.setSize(420, 440)
  await delay(300)
  verify(await js(mini, 'document.documentElement.scrollWidth <= innerWidth'), 'long custom idea wraps in a small window')
  await js(mini, "document.querySelector('#close').scrollIntoView()")
  await capture(mini, 'after-microbreak-long-content')
  verify(await js(mini, "document.querySelector('#close').getBoundingClientRect().bottom <= innerHeight + 1"), 'long custom content keeps action reachable by scrolling')
  await js(mini, "document.querySelector('#close').click()")
  await delay(500)
}

async function layoutMatrix (win, kind) {
  const original = win.getSize()
  const originalTheme = nativeTheme.themeSource
  win.webContents.debugger.attach('1.3')
  try {
    for (const theme of ['light', 'dark']) {
      nativeTheme.themeSource = theme
      for (const [width, height] of [[1632, 918], [1920, 1080], [2560, 1440], [3440, 1440], [3840, 2160], [681, 453], [720, 480], [680, 420], [700, 1000], [600, 620]]) {
        // Emulation permits viewports larger than the attached display.
        await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
        const geometry = await win.webContents.executeJavaScript(`(() => {
          const portrait = document.querySelector('.rest-illustration-${theme === 'dark' ? 'night' : 'day'}')
          const image = portrait.getBoundingClientRect()
          const content = document.querySelector('.breaks').getBoundingClientRect()
          return {
            width: innerWidth, height: innerHeight, dark: matchMedia('(prefers-color-scheme: dark)').matches,
            image: { left: image.left, right: image.right, width: image.width, height: image.height },
            portraitRatio: portrait.naturalWidth / portrait.naturalHeight,
            contentCenter: (content.left + content.right) / 2, contentRight: content.right,
            visible: getComputedStyle(portrait).display !== 'none',
            overflow: document.documentElement.scrollWidth > innerWidth
          }
        })()`)
        const name = `${kind}-${theme}-${width}x${height}`
        writeFileSync(join(evidence, `${name}.json`), JSON.stringify(geometry, null, 2))
        verify(geometry.width === width && geometry.height === height && geometry.dark === (theme === 'dark'), `${name}: requested viewport and theme`)
        verify(!geometry.overflow, `${name}: no horizontal overflow`)
        const showPortrait = width > 680 && width / height > 1.5
        verify(geometry.visible === showPortrait, `${name}: portrait visibility follows window proportions`)
        if (showPortrait) {
          verify(geometry.image.right === width && geometry.image.height === height, `${name}: full-height portrait is right anchored`)
          verify(Math.abs(geometry.image.width / height - geometry.portraitRatio) < 0.001, `${name}: original aspect ratio`)
          verify(geometry.contentRight <= geometry.image.left, `${name}: text and image do not overlap`)
        }
        const contentRight = showPortrait ? geometry.image.left : width
        verify(Math.abs(geometry.contentCenter - contentRight / 2) < 1, `${name}: controls are centered in the available space`)
        if (width === 1632 || width === 3440 || width === 700) {
          const { data } = await win.webContents.debugger.sendCommand('Page.captureScreenshot', { captureBeyondViewport: true })
          writeFileSync(join(evidence, `${name}.png`), Buffer.from(data, 'base64'))
        }
      }
    }
  } finally {
    await win.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride')
    win.webContents.debugger.detach()
    win.setSize(...original)
    nativeTheme.themeSource = originalTheme
  }
}
