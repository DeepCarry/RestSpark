// Run with Electron on macOS. Use --system-appearance to temporarily change macOS appearance.
import { app, BrowserWindow, nativeTheme, screen } from 'electron'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const evidence = resolve(process.env.REST_APPEARANCE_EVIDENCE || 'docs/rest-spark/appearance/evidence')
mkdirSync(evidence, { recursive: true })
const restart = process.argv.includes('--restart')
const profile = restart
  ? JSON.parse(readFileSync(join(evidence, 'macos-appearance.json'))).profile
  : mkdtempSync(join(tmpdir(), 'restspark-appearance-'))
app.setPath('userData', profile)
app.setPath('logs', join(profile, 'logs'))
const configPath = join(profile, 'config.json')
const config = () => JSON.parse(readFileSync(configPath))
if (!restart) {
  writeFileSync(configPath, JSON.stringify({
    isFirstRun: false,
    language: 'zh-CN',
    disableAppUpdateFeatures: true,
    checkNewVersion: false,
    openAtLogin: false,
    _migratedOpenAtLogin: true,
    naturalBreaks: false,
    monitorDnd: false,
    allScreens: false,
    showBreaksAsRegularWindows: true,
    silentNotifications: true,
    microbreakNotification: false,
    breakNotification: false,
    microbreakDuration: 60000,
    breakDuration: 60000,
    microbreakPostpone: true,
    breakPostpone: true,
    mainColor: '#633738',
    preservedSetting: 'legacy'
  }))
}

const pages = ['settings', 'schedule', 'theme', 'about']
const checks = []
const verify = (condition, name) => { assert.ok(condition, name); checks.push(name) }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const evaluate = (win, expression) => win.webContents.executeJavaScript(expression)
const command = (...args) => app.emit('second-instance', {}, [], root, args)
const windowFor = file => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/' + file + '.html'))
const capture = async (win, name) => {
  await delay(120)
  const image = await win.webContents.capturePage()
  assert.ok(!image.isEmpty(), name)
  writeFileSync(join(evidence, name + '.png'), image.toPNG())
}
async function until (name, condition) {
  for (let i = 0; i < 100; i++) {
    const result = await condition()
    if (result) return result
    await delay(60)
  }
  throw new Error('Timed out waiting for ' + name)
}

const checkSystem = process.argv.includes('--system-appearance') && !restart
function systemAppearance (action) {
  return execFileSync('/usr/bin/osascript', ['-e', 'with timeout of 8 seconds', '-e',
    `tell application "System Events" to tell appearance preferences to ${action}`, '-e', 'end timeout'], { encoding: 'utf8', timeout: 12000 }).trim()
}

await import('../app/main.js')
app.whenReady().then(async () => {
  let originalDark
  try {
    await delay(1500)
    command('preferences')
    const prefs = await until('preferences', () => windowFor('preferences'))
    const js = code => evaluate(prefs, code)
    await until('initial appearance selection', () => js("Boolean(document.querySelector('[name=themeSource]:checked'))").catch(() => false))
    const choose = async mode => {
      await js(`document.querySelector('[data-section=theme]').click(); document.querySelector('label[for=appearance-${mode}]').click()`)
      await until('persisted ' + mode, () => nativeTheme.themeSource === mode && config().themeSource === mode)
    }
    const showPage = page => js(`document.querySelector('[data-section=${page}]').click(); document.querySelector('.${page}').scrollTop = 0`)
    const settingsState = () => js(`({
      mode: document.querySelector('[name=themeSource]:checked').value,
      dark: matchMedia('(prefers-color-scheme: dark)').matches,
      background: getComputedStyle(document.body).backgroundColor,
      sidebar: getComputedStyle(document.querySelector('.navigation')).backgroundColor
    })`)
    const expectMode = async dark => until('settings resolved appearance', async () => (await settingsState()).dark === dark)
    const save = async (key, value) => {
      await js(`window.settings.saveSettings(${JSON.stringify(key)}, ${JSON.stringify(value)})`)
      await until(key, () => config()[key] === value)
    }

    if (restart) {
      await expectMode(true)
      verify(nativeTheme.themeSource === 'dark' && (await settingsState()).mode === 'dark', 'saved dark choice restores in a fresh Electron process')
      verify(config().preservedSetting === 'legacy' && config().settingsThemeBackup.mainColor === '#633738', 'legacy values still present after restart')
      writeFileSync(join(evidence, 'restart.json'), JSON.stringify({ checks, profile }, null, 2))
    } else {
      verify(nativeTheme.themeSource === 'system' && (await settingsState()).mode === 'system', 'missing themeSource defaults to Follow System')
      verify(config().settingsThemeBackup.mainColor === '#633738' && config().preservedSetting === 'legacy', 'legacy color backed up and unrelated data preserved')

      if (checkSystem) {
        let auto
        try {
          auto = execFileSync('/usr/bin/defaults', ['read', '-g', 'AppleInterfaceStyleSwitchesAutomatically'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
        } catch {}
        assert.ok(!['1', 'true', 'YES'].includes(auto), 'temporarily testing macOS appearance requires a fixed system appearance')
        originalDark = systemAppearance('get dark mode') === 'true'
      }
      const setSystem = async dark => {
        systemAppearance(`set dark mode to ${dark}`)
        await until('macOS appearance', () => systemAppearance('get dark mode') === String(dark))
      }
      const assertForcedMode = async dark => {
        await expectMode(dark)
        const state = await settingsState()
        verify(state.background === (dark ? 'rgb(17, 31, 28)' : 'rgb(227, 242, 238)'), 'preferences uses the shared background')
        if (dark) verify(state.sidebar === 'rgb(22, 41, 35)', 'Night Mint uses the shared sidebar')
      }

      const display = screen.getDisplayMatching(prefs.getBounds())
      const verifyAppearanceArtwork = async () => {
        await showPage('theme')
        const previews = await js(`Array.from(document.querySelectorAll('.appearance-preview img'), image => ({
          file: image.currentSrc.split('/').at(-1),
          width: image.naturalWidth,
          height: image.naturalHeight,
          previewWidth: image.clientWidth,
          previewHeight: image.clientHeight,
          fit: getComputedStyle(image).objectFit,
          split: Boolean(image.closest('.appearance-split'))
        }))`)
        verify(previews.map(image => image.file).join(',') === 'stretch.png,stretch-night.png,stretch.png,stretch-night.png', 'light, dark and Follow System cards show the expected image pair')
        verify(previews.every(image => image.width === 1122 && image.height === 1402 && image.fit === 'cover' && image.previewWidth > 0 && image.previewHeight > 0), 'all appearance cards fill their previews with proportional artwork')
        verify(previews.filter(image => !image.split).every(image => Math.abs(image.previewHeight - image.previewWidth * image.height / image.width) < 2), 'single-theme previews follow the artwork ratio at each window width')
      }
      for (const mode of ['light', 'dark']) {
        if (checkSystem) await setSystem(mode === 'light')
        await choose(mode)
        await assertForcedMode(mode === 'dark')
        verify((await settingsState()).mode === mode, 'selection matches persisted ' + mode)
        prefs.setSize(860, 740)
        await verifyAppearanceArtwork()
        for (const page of pages) {
          await showPage(page)
          await capture(prefs, `settings-${page}-${mode}`)
        }
      }

      await showPage('theme')
      prefs.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' })
      prefs.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
      await until('visible keyboard focus', () => js("Boolean(document.querySelector(':focus-visible'))"))
      await js("document.querySelector('#appearance-dark').focus()")
      prefs.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' })
      prefs.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' })
      await until('keyboard selection', () => config().themeSource === 'system')
      verify(await js("document.querySelector('#appearance-system').matches(':checked:focus-visible')"), 'native arrow key selects Follow System and displays keyboard focus')

      for (const language of ['en', 'zh-CN']) {
        await save('language', language)
        await until('translated document', () => js(`document.documentElement.lang === '${language}'`))
        for (const [width, height, zoom] of [[860, 740, 1], [620, 680, 1], [760, 700, 1.25]]) {
          prefs.setSize(width, height)
          prefs.webContents.setZoomFactor(zoom)
          for (const page of pages) {
            await showPage(page)
            verify(await js(`(() => { const page = document.querySelector('.${page}'); return page.scrollWidth <= page.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth })()`), `${language}/${width}/${zoom}/${page} has no horizontal overflow`)
          }
          if (language === 'en' && width === 620) {
            await verifyAppearanceArtwork()
            verify(await js("document.querySelector('[for=appearance-system]').textContent.trim() === 'Follow System'"), 'English appearance label is translated')
            await capture(prefs, 'settings-theme-english-narrow')
          }
        }
      }
      prefs.webContents.setZoomFactor(1)
      prefs.setSize(860, 740)
      await showPage('theme')

      const breakState = win => evaluate(win, `(() => {
      const image = Array.from(document.querySelectorAll('.rest-illustration')).find(img => getComputedStyle(img).display !== 'none')
      return {
        image: image?.currentSrc.split('/').at(-1),
        loaded: image?.complete && image.naturalWidth > 0,
        opacity: image && getComputedStyle(image).opacity,
        dark: matchMedia('(prefers-color-scheme: dark)').matches,
        remaining: document.querySelector('#progress').value,
        postpone: !document.querySelector('#postpone').classList.contains('hidden'),
        skip: !document.querySelector('#close').classList.contains('hidden')
      }
    })()`)
      const waitPortrait = async (win, dark) => {
        let state
        try {
          return await until('break portrait', async () => {
            state = await breakState(win)
            return state.dark === dark && state.loaded && state.image === (dark ? 'stretch-night.png' : 'stretch.png') && state
          })
        } catch (error) {
          throw new Error(`Expected ${dark ? 'dark' : 'light'} break portrait, got ${JSON.stringify(state)}`, { cause: error })
        }
      }
      const begin = async (commandName, file, title) => {
        command(commandName, '-T', title)
        const win = await until(file + ' window', () => windowFor(file))
        await until(file + ' countdown', () => evaluate(win, "Boolean(document.querySelector('#progress-time')?.textContent)"))
        return win
      }
      const layouts = []
      const checkBreakLayout = async (win, type, dark) => {
        win.webContents.debugger.attach('1.3')
        for (const [width, height] of [[1920, 1080], [2560, 1440], [3440, 1440]]) {
          await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
          const layout = await evaluate(win, `(() => {
            const image = document.querySelector('.rest-illustration-${dark ? 'night' : 'day'}').getBoundingClientRect()
            const text = document.querySelector('.breaks').getBoundingClientRect()
            return { width: innerWidth, height: innerHeight, right: image.right, artworkHeight: image.height, left: image.left, textRight: text.right }
          })()`)
          verify(layout.width === width && layout.height === height && layout.right === width && layout.artworkHeight === height && layout.textRight <= layout.left, `${type}/${dark ? 'dark' : 'light'}: ${width}×${height} renderer portrait is full-height, flush-right and clear of controls`)
          layouts.push({ type, dark, ...layout })
        }
        await win.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride')
        win.webContents.debugger.detach()
      }
      for (const [type, file] of [['mini', 'microbreak'], ['long', 'break']]) {
        if (checkSystem) {
          await setSystem(false)
          await choose('system')
        } else {
          await choose('light')
        }
        const win = await begin(type, file, '起身，舒展一下')
        const light = await waitPortrait(win, false)
        await capture(win, `break-${type}-light`)
        await checkBreakLayout(win, type, false)
        if (checkSystem) {
          await capture(prefs, `system-${type}-settings-light`)
          await setSystem(true)
          await expectMode(true)
          verify((await settingsState()).mode === 'system' && config().themeSource === 'system', 'macOS dark keeps Follow System selected')
          await capture(prefs, `system-${type}-settings-dark`)
        } else {
          await choose('dark')
        }
        const dark = await waitPortrait(win, true)
        verify(dark.opacity === '1' && dark.remaining < light.remaining && dark.postpone === light.postpone && dark.skip === light.skip, `${type}: live dark transition preserves countdown and actions at full artwork opacity`)
        await capture(win, `break-${type}-dark`)
        if (checkSystem) {
          await setSystem(false)
          await expectMode(false)
          const returned = await waitPortrait(win, false)
          verify(windowFor(file)?.id === win.id && returned.remaining < dark.remaining && (await settingsState()).mode === 'system', `${type}: macOS light restores portrait on the same running window`)
          await capture(win, `system-${type}-returned-light`)
          await setSystem(true)
          await waitPortrait(win, true)
        }

        await checkBreakLayout(win, type, true)
        await evaluate(win, "document.querySelector('#postpone').click()")
        await until(type + ' postpone closes window', () => win.isDestroyed())
        verify(!windowFor(file), `${type}: postpone works after live switching`)
        command('reset')

        const strictKey = type === 'mini' ? 'microbreakStrictMode' : 'breakStrictMode'
        const postponeKey = type === 'mini' ? 'microbreakPostpone' : 'breakPostpone'
        const durationKey = type === 'mini' ? 'microbreakDuration' : 'breakDuration'
        const manualKey = type === 'mini' ? 'miniBreakManualFinish' : 'longBreakManualFinish'
        await save(strictKey, true)
        await save(postponeKey, false)
        await save(durationKey, 1800)
        await save(manualKey, true)
        const strict = await begin(type, file, '休息一下')
        await until(type + ' strict manual finish', () => evaluate(strict, "!document.querySelector('#finish').classList.contains('hidden')"))
        verify(await evaluate(strict, "document.querySelector('#close').classList.contains('hidden') && document.querySelector('#postpone').classList.contains('hidden')"), `${type}: strict mode blocks skip and postpone until finish`)
        await evaluate(strict, "document.querySelector('#finish').click()")
        await until(type + ' manual finish closes window', () => strict.isDestroyed())

        await save(strictKey, false)
        await save(durationKey, 60000)
        const skippable = await begin(type, file, '休息一下')
        await until(type + ' skip becomes available', () => evaluate(skippable, "!document.querySelector('#close').classList.contains('hidden')"))
        await evaluate(skippable, "document.querySelector('#close').click()")
        await until(type + ' skip closes window', () => skippable.isDestroyed())
        verify(!windowFor(file), `${type}: skip works in ordinary mode`)
        await save(postponeKey, true)
      }

      await choose('dark')
      await save('language', 'en')
      await until('English settings', () => js("document.documentElement.lang === 'en'"))
      await save('transparentMode', true)
      await save('showBreaksAsRegularWindows', false)
      const english = await begin('long', 'break', 'Stand up and stretch')
      await waitPortrait(english, true)
      const englishBreak = await evaluate(english, `({
        title: document.querySelector('.break-idea').textContent,
        postpone: document.querySelector('#postpone span').textContent,
        opacity: getComputedStyle(document.body).getPropertyValue('--rest-opacity').trim()
      })`)
      verify(englishBreak.title === 'Stand up and stretch' && /postpone/i.test(englishBreak.postpone) && Number(englishBreak.opacity) === config().opacity, 'native frameless Night Mint window uses English actions and the saved transparency')
      await capture(english, 'break-long-english-transparent')
      await evaluate(english, "document.querySelector('#postpone').click()")
      await until('English break closes', () => english.isDestroyed())
      await save('language', 'zh-CN')
      await js("window.settings.saveSettings('themeSource', '#633738')")
      await js('window.settings.currentSettings()')
      verify(config().themeSource === 'dark' && nativeTheme.themeSource === 'dark', 'invalid IPC theme value is ignored')
      writeFileSync(join(evidence, 'macos-appearance.json'), JSON.stringify({ checks, layouts, profile, checkSystem, display, versions: process.versions }, null, 2))
    }
    console.log('MACOS_APPEARANCE_PASSED', checks.length, profile)
  } catch (error) {
    writeFileSync(join(evidence, 'macos-appearance-failure.json'), JSON.stringify({ checks, error: error.stack }, null, 2))
    console.error(error)
    process.exitCode = 1
  } finally {
    try {
      if (originalDark !== undefined) systemAppearance(`set dark mode to ${originalDark}`)
    } catch (error) {
      console.error('Could not restore original macOS appearance', error)
      process.exitCode = 1
    }
    app.exit(process.exitCode || 0)
  }
})
