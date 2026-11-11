import {
  app, nativeTheme, BrowserWindow, Menu, ipcMain,
  screen, shell, dialog, globalShortcut, Tray,
  powerMonitor, nativeImage
} from 'electron'
import { EventEmitter } from 'node:events'
import { readFile, writeFile, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'path'
import { resolveLocalImage } from './utils/imageResolver.js'
import { fileURLToPath } from 'url'
import i18next from 'i18next'
import Backend from 'i18next-fs-backend'
import log from 'electron-log/main.js'
import Store from 'electron-store'
import humanizeDuration from 'humanize-duration'
import { DateTime } from 'luxon'

import {
  formatTimeRemaining,
  minutesRemaining, insideWindowsStore, insideFlatpak, insideSnap, insideWindowsPortable
} from './utils/utils.js'
import IdeasLoader from './utils/ideasLoader.js'
import { pauseChoices, popoverBounds } from './utils/restSparkPopover.js'
import { onboardingPatch, presetForSchedule, shouldShowOnboarding } from './utils/restSparkOnboarding.js'
import { breakActions } from './utils/breakActions.js'
import BreaksPlanner from './breaksPlanner.js'
import AppIcon from './utils/appIcon.js'
import AutostartManager from './utils/autostartManager.js'
import Command from './utils/commands.js'
import { registerBreakShortcuts } from './utils/breakShortcuts.js'
import defaultSettings from './utils/defaultSettings.js'
import { readScheduleSettings, migrateIndependentSchedule } from './utils/independentScheduleMigration.js'
import { saveSchedulePatch } from './utils/scheduleControls.js'
import { migrateSoundSettings } from './utils/restSparkSounds.js'
import { migrateMintTheme, normalizeThemeSource } from './utils/settingsTheme.js'
import StatusMessages from './utils/statusMessages.js'
import DisplayManager from './utils/displayManager.js'
import { BRAND } from './utils/brand.js'
import { configureBrandIdentity, migrateLegacyProfile, readSavedOpenAtLogin, resolveLoginPreference } from './utils/brandProfile.js'
import { macTrayAsset, trayStatusTitle } from './utils/restSparkTray.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const brandIdentity = configureBrandIdentity(app, { portable: insideWindowsPortable() })

process.on('uncaughtException', (err, _) => {
  log.error(err)
  const dialogOpts = {
    type: 'error',
    title: BRAND.name,
    message: 'Rest Spark encountered an error and will now quit. Click Report to open the project issue tracker.',
    buttons: ['Report', 'OK']
  }
  dialog.showMessageBox(dialogOpts).then((returnValue) => {
    if (returnValue.response === 0) {
      shell.openExternal(BRAND.issues)
    }
    app.quit()
  })
})

nativeTheme.on('updated', function theThemeHasChanged () {
  if (!gotTheLock) {
    return
  }
  updateTray()
})

let microbreakIdeas
let breakIdeas
let breakPlanner
let appIcon = null
let autostartManager = null
let displayManager = null
let processWin = null
let microbreakWins = null
let breakWins = null
let activeBreak = null
let preferencesWin = null
let welcomeWin = null
let showOnboarding = false
let welcomePreview = false
let contributorPreferencesWin = null
let syncPreferencesWin = null
let myStretchlyWin = null
let settings
let nextIdea = null
let danger = 0
let updateChecker
let currentTrayIconPath = null
let currentTrayMenuTemplate = null
let trayPanel = null
let trayPanelOptions = false
let powerMonitoringStarted = false
let gentlePreviewType = null
let trayUpdateIntervalObj = null

if (insideWindowsPortable()) {
  const portableDataPath = join(process.env.PORTABLE_EXECUTABLE_DIR, 'Data')
  if (!existsSync(portableDataPath)) {
    mkdirSync(portableDataPath, { recursive: true })
  }
  app.setPath('userData', portableDataPath)
}

log.initialize({ preload: true })

// https://stackoverflow.com/questions/65859634/notification-from-electron-shows-electron-app-electron/65863174#65863174
if (process.platform === 'win32') {
  app.setAppUserModelId(BRAND.appId)
}

const global = {
  isNewVersion: false,
  isContributor: false
}

ipcMain.on('set-global-value', (event, name, value) => {
  global[name] = value
})

ipcMain.handle('get-global-value', (event, name) => {
  return global[name]
})

const commandLineArguments = process.argv
  .slice(app.isPackaged ? 1 : 2)

const gotTheLock = app.requestSingleInstanceLock(commandLineArguments)

if (!gotTheLock) {
  const cmd = new Command(commandLineArguments, app.getVersion(), false)
  cmd.runOrForward()
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory, commandLineArguments) => {
    log.info(`Stretchly: arguments received from second instance: ${commandLineArguments}`)
    const cmd = new Command(commandLineArguments, app.getVersion())

    if (!cmd.hasSupportedCommand) {
      return
    }

    if (!cmd.checkInMain()) {
      log.info(`Stretchly: command '${cmd.command}' executed in second instance, dropped in main instance`)
      return
    }

    switch (cmd.command) {
      case 'reset':
        log.info('Stretchly: resetting breaks (requested by second instance)')
        resetBreaks()
        break

      case 'mini': {
        log.info('Stretchly: skip to Mini break (requested by second instance)')
        const delay = cmd.waitToMs()
        if (delay === -1) {
          log.error('Stretchly: error parsing wait interval to ms because of invalid value')
          return
        }
        if (cmd.options.title) nextIdea = [cmd.options.title]
        if (!cmd.options.noskip || delay) skipToMicrobreak(delay)
        break
      }

      case 'long': {
        log.info('Stretchly: skip to Long break (requested by second instance)')
        const delay = cmd.waitToMs()
        if (delay === -1) {
          log.error('Stretchly: error parsing wait interval to ms because of invalid value')
          return
        }
        nextIdea = [cmd.options.title ? cmd.options.title : null, cmd.options.text ? cmd.options.text : null]
        if (!cmd.options.noskip || delay) skipToBreak(delay)
        break
      }

      case 'resume':
        log.info('Stretchly: resume Breaks (requested by second instance)')
        if (breakPlanner.isPaused) resumeBreaks(false)
        break

      case 'toggle':
        log.info('Stretchly: toggle Breaks (requested by second instance)')
        if (breakPlanner.isPaused) resumeBreaks(false)
        else pauseBreaks(1)
        break

      case 'pause': {
        log.info('Stretchly: pause Breaks (requested by second instance)')
        const duration = cmd.durationToMs(settings)
        // -1 indicates an invalid value
        if (duration === -1) {
          log.error('Stretchly: error when parsing duration to ms because of invalid value')
          return
        }
        pauseBreaks(duration)
        break
      }

      case 'preferences':
        log.info('Stretchly: open Preferences window (requested by second instance)')
        createPreferencesWindow()
        break
    }
  })
}

app.on('ready', initialize)
app.on('window-all-closed', () => {
  // do nothing, so app wont get closed
})
app.on('before-quit', (event) => {
  if (!breakPlanner || !settings) {
    globalShortcut.unregisterAll()
    return
  }
  if ((breakPlanner.scheduler.reference === 'finishMicrobreak' && settings.get('microbreakStrictMode')) ||
      (breakPlanner.scheduler.reference === 'finishBreak' && settings.get('breakStrictMode'))
  ) {
    log.info('Stretchly: preventing app closure (in break with strict mode)')
    event.preventDefault()
  } else {
    globalShortcut.unregisterAll()
    // Clean up D-Bus connections
    if (autostartManager) {
      autostartManager.disconnect()
    }
    app.quit()
  }
})

async function initialize (isAppStart = true) {
  if (!gotTheLock) {
    return
  }
  // Read explicit preferences before electron-store adds defaults.
  let savedOpenAtLogin
  let savedScheduleSettings
  if (!settings) {
    try {
      if (brandIdentity.allowLegacyMigration) {
        const migration = migrateLegacyProfile(brandIdentity)
        log.info(`Rest Spark profile: ${migration.status}`)
      }
      savedOpenAtLogin = readSavedOpenAtLogin(app.getPath('userData'))
      savedScheduleSettings = readScheduleSettings(app.getPath('userData'))
    } catch (error) {
      log.error('Rest Spark could not load/import settings', error)
      dialog.showErrorBox(BRAND.name,
        `Rest Spark could not load or import settings.\n\nSource: ${brandIdentity.source}\nDestination: ${app.getPath('userData')}\n\n${error.message}\n\nYour original Stretchly files were left in place. Resolve the error and restart Rest Spark.`)
      app.quit()
      return
    }
  }
  // TODO maybe we should not reinitialize but handle everything when we save new values for preferences
  log.info(`Stretchly: ${isAppStart ? '' : 're'}initializing...`)

  EventEmitter.setMaxListeners(200) // for watching Store changes
  if (!settings) {
    showOnboarding = shouldShowOnboarding(savedScheduleSettings)
    settings = new Store({
      defaults: defaultSettings,
      beforeEachMigration: (store, context) => {
        log.info(`Stretchly: migrating preferences from Stretchly v${context.fromVersion} to v${context.toVersion}`)
      },
      migrations: {
        '1.13.0': store => {
          if (store.has('pauseBreaksShortcut')) {
            store.set('pauseBreaksToggleShortcut', store.get('pauseBreaksShortcut'))
            log.info(`Stretchly: settings pauseBreaksToggleShortcut to "${store.get('pauseBreaksShortcut')}"`)
            store.delete('pauseBreaksShortcut')
            log.info('Stretchly: removing pauseBreaksShortcut')
          } else {
            log.info('Stretchly: not migrating pauseBreaksShortcut')
          }
          if (store.has('pauseBreaksShortcut')) {
            store.delete('resumeBreaksShortcut')
            log.info('Stretchly: removing resumeBreaksShortcut')
          }
        },
        '1.17.0': store => {
          if (store.has('showBreakActionsInStrictMode')) {
            store.set('showTrayMenuInStrictMode', store.get('showBreakActionsInStrictMode'))
            log.info(`Stretchly: settings showTrayMenuInStrictMode to "${store.get('showBreakActionsInStrictMode')}"`)
            store.delete('showBreakActionsInStrictMode')
            log.info('Stretchly: removing showBreakActionsInStrictMode')
          } else {
            log.info('Stretchly: not migrating showBreakActionsInStrictMode')
          }
        },
        '1.18.2': store => {
          if (insideFlatpak() || insideWindowsStore() || insideSnap()) {
            if (!store.get('disableAppUpdateFeatures')) {
              store.set('disableAppUpdateFeatures', true)
              log.info('Stretchly: setting disableAppUpdateFeatures to true because we are in Flatpak/Windows Store/Snap build')
            }
          }
        },
        '1.19.0': store => {
          if (store.has('audio')) {
            const legacyAudio = store.get('audio')
            store.set('longBreakAudio', legacyAudio)
            log.info(`Stretchly: migrating audio to longBreakAudio with value "${legacyAudio}"`)
            store.delete('audio')
            log.info('Stretchly: removing audio')
          } else {
            log.info('Stretchly: not migrating audio to longBreakAudio')
          }
          if (store.has('microbreakStartSoundPlaying')) {
            const val = store.get('microbreakStartSoundPlaying') ? store.get('miniBreakAudio') : 'silence'
            store.set('miniBreakStartSound', val)
            log.info(`Stretchly: migrating microbreakStartSoundPlaying to miniBreakStartSound with value "${val}"`)
            store.delete('microbreakStartSoundPlaying')
            log.info('Stretchly: removing microbreakStartSoundPlaying')
          } else {
            log.info('Stretchly: not migrating microbreakStartSoundPlaying')
          }
          if (store.has('breakStartSoundPlaying')) {
            const val = store.get('breakStartSoundPlaying') ? store.get('longBreakAudio') : 'silence'
            store.set('longBreakStartSound', val)
            log.info(`Stretchly: migrating breakStartSoundPlaying to longBreakStartSound with value "${val}"`)
            store.delete('breakStartSoundPlaying')
            log.info('Stretchly: removing breakStartSoundPlaying')
          } else {
            log.info('Stretchly: not migrating breakStartSoundPlaying')
          }
        },
        '1.20.0': store => {
          if (store.has('timeToBreakInTray')) {
            if (store.get('timeToBreakInTray')) {
              store.set('trayIconStyle', 'time')
              log.info('Stretchly: migrating timeToBreakInTray to trayIconStyle="time"')
            } else {
              store.set('trayIconStyle', 'default')
              log.info('Stretchly: migrating tray settings to trayIconStyle="default"')
            }
            store.delete('timeToBreakInTray')
          }
        }
      },
      watch: true
    })
    if (!savedScheduleSettings && app.getLocale().toLowerCase().startsWith('zh')) settings.set('language', 'zh-CN')
    const savedSettings = settings.store
    const migratedSounds = migrateSoundSettings(savedSettings)
    if (migratedSounds !== savedSettings) settings.store = migratedSounds
    migrateMintTheme(settings)
    settings.onDidChange('themeSource', value => {
      nativeTheme.themeSource = normalizeThemeSource(value)
    })
    migrateIndependentSchedule(settings, savedScheduleSettings)
    log.info('Stretchly: loading preferences')
    Store.initRenderer()
    Object.entries(settings.store).forEach(([key, _]) => {
      settings.onDidChange(key, (newValue, oldValue) => {
        log.info(`Stretchly: setting '${key}' to '${JSON.stringify(newValue)}' (was '${JSON.stringify(oldValue)}')`)
      })
    })
  }
  if (!breakPlanner) {
    breakPlanner = new BreaksPlanner(settings)
    breakPlanner.nextBreak()
    breakPlanner.on('startMicrobreakNotification', () => { startGentlePreview('microbreak') })
    breakPlanner.on('startBreakNotification', () => { startGentlePreview('break') })
    breakPlanner.on('startMicrobreak', () => { startMicrobreak() })
    breakPlanner.on('finishMicrobreak', (shouldPlaySound, shouldPlanNext) => {
      if (shouldPlanNext && settings.get('miniBreakManualFinish')) {
        enterMiniBreakManualContinuation(shouldPlaySound)
        return
      }
      decreaseDanger(1)
      finishMicrobreak(shouldPlaySound, shouldPlanNext)
    })
    breakPlanner.on('startBreak', () => { startBreak() })
    breakPlanner.on('finishBreak', (shouldPlaySound, shouldPlanNext) => {
      if (shouldPlanNext && settings.get('longBreakManualFinish')) {
        enterLongBreakManualContinuation(shouldPlaySound)
        return
      }
      decreaseDanger(2)
      finishBreak(shouldPlaySound, shouldPlanNext)
    })
    breakPlanner.on('interruptBreak', () => {
      if (microbreakWins) finishMicrobreak(false, false)
      if (breakWins) finishBreak(false, false)
    })
    breakPlanner.on('updateToolTip', function () {
      preferencesWin?.webContents.send('focus-status', breakPlanner.dndManager.status)
      updateTray()
    })
  } else {
    if (microbreakWins) finishMicrobreak(false, false)
    if (breakWins) finishBreak(false, false)
    cancelGentlePreview()
    breakPlanner.clear()
    breakPlanner.restoreManualPause()
    breakPlanner.appExclusionsManager.reinitialize(settings)
    breakPlanner.doNotDisturb(settings.get('monitorDnd'))
    breakPlanner.naturalBreaks(settings.get('naturalBreaks'))
    breakPlanner.nextBreak()
  }

  autostartManager = new AutostartManager({
    app,
    settings
  })

  if (!settings.get('_migratedOpenAtLogin')) {
    // one time migration with 1.20 or after
    settings.set('openAtLogin', resolveLoginPreference(savedOpenAtLogin, await autostartManager.autoLaunchStatus()))
    settings.set('_migratedOpenAtLogin', true)
    log.info('Stretchly: Migrated to openAtLogin')
  }

  const currentAutostartValue = await autostartManager.autoLaunchStatus()
  const openAtLogin = settings.get('openAtLogin')
  if (openAtLogin !== currentAutostartValue) {
    autostartManager.setAutostartEnabled(openAtLogin)
  }
  log.info(`Stretchly: attempting to set autostart to ${openAtLogin}`)

  const imagesDir = join(app.getPath('userData'), 'images')
  if (!existsSync(imagesDir)) {
    try {
      mkdirSync(imagesDir, { recursive: true })
    } catch (error) {
      log.error('Stretchly: error creating images directory', error)
    }
  }
  // Initialize portal early for Flatpak so it's ready when user opens preferences
  if (insideFlatpak()) {
    autostartManager.flatpakPortalManager.initialize().catch(err => {
      log.error('Stretchly: Failed to initialize portal manager during startup:', err)
    })
  }

  displayManager = new DisplayManager(settings)

  startI18next()
  startProcessWin()
  nativeTheme.themeSource = normalizeThemeSource(settings.get('themeSource'))
  if (isAppStart) createWelcomeWindow()

  readFile(join(app.getPath('userData'), 'stamp'), 'utf8', (err, data) => {
    if (err) {
      return
    }
    if (DateTime.fromISO(data).month === DateTime.now().month) {
      global.isContributor = true
      log.info('Stretchly: Thanks for your contributions!')
      if (preferencesWin) {
        preferencesWin.webContents.send('enable-contributor-preferences')
      }
      updateTray()
    }
  })
  startPowerMonitoring()
  if (preferencesWin) {
    preferencesWin.webContents.send('renderSettings', settings.store)
  }
  if (contributorPreferencesWin) {
    contributorPreferencesWin.webContents.send('renderSettings', settings.store)
  }
  globalShortcut.unregisterAll()

  registerBreakShortcuts({
    settings,
    log,
    globalShortcut,
    breakPlanner,
    functions: { pauseBreaks, resumeBreaks, skipToBreak, skipToMicrobreak, resetBreaks }
  })

  updateTray()
}

function startI18next () {
  i18next
    .use(Backend)
    .init({
      lng: settings.get('language'),
      fallbackLng: 'en',
      debug: !app.isPackaged,
      backend: {
        loadPath: join(__dirname, '/locales/{{lng}}.json'),
        jsonIndent: 2
      }
    }, function (err, t) {
      if (err) {
        log.error(err.stack)
      }
    })
}

i18next.on('languageChanged', () => {
  if (preferencesWin) {
    preferencesWin.webContents.send('translate')
  }
  updateTray()
  loadIdeas()
})

function startPowerMonitoring () {
  if (powerMonitoringStarted) return
  powerMonitoringStarted = true
  for (const [reason, start, stop] of [['suspend', 'suspend', 'resume'], ['lock', 'lock-screen', 'unlock-screen']]) {
    let transition = 0
    powerMonitor.on(start, () => {
      transition += 1
      if (settings.get('pauseForSuspendOrLock')) breakPlanner.setPowerBlock(reason, true)
    })
    powerMonitor.on(stop, async () => {
      const current = ++transition
      await breakPlanner.dndManager.refresh()
      if (transition !== current) return
      breakPlanner.setPowerBlock(reason, false)
      breakPlanner.correctScheduler()
      updateTray()
    })
  }
}

function closeWindows (windowArray) {
  for (const window of windowArray) {
    if (!window || window.isDestroyed()) {
      continue
    }

    window.hide()
    // Use destroy() for immediate, guaranteed cleanup on all platforms
    window.destroy()
  }
  return null
}

function trayIconPath () {
  const params = trayIconParams()
  if (process.platform === 'darwin') return join(__dirname, 'images/app-icons', macTrayAsset)
  const trayIconFileName = new AppIcon(params).trayIconFileName
  return join(__dirname, 'images/app-icons', trayIconFileName)
}

function trayIconParams () {
  return {
    paused: breakPlanner.autoBlocked,
    monochrome: settings.get('useMonochromeTrayIcon'),
    inverted: settings.get('useMonochromeInvertedTrayIcon'),
    darkMode: nativeTheme.shouldUseDarkColors,
    platform: process.platform,
    trayIconStyle: settings.get('trayIconStyle'),
    timeToBreak: minutesRemaining(breakPlanner.timeToNextBreak),
    percentage: breakPlanner.progressPercentage,
    reference: breakPlanner.scheduler.reference
  }
}

function trayImage () {
  const image = nativeImage.createFromPath(trayIconPath())
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}

function windowIconPath () {
  return join(__dirname, 'images/brand/restspark-icon-256.png')
}

function startProcessWin () {
  if (processWin) {
    planVersionCheck()
    return
  }
  const modalPath = 'file://' + join(__dirname, '/process.html')

  processWin = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    backgroundThrottling: false,
    webPreferences: {
      preload: join(__dirname, './process-preload.mjs'),
      sandbox: false
    }
  })
  processWin.webContents.loadURL(modalPath)
  processWin.webContents.once('ready-to-show', () => {
    planVersionCheck()
  })
}

function createWelcomeWindow (preview = false) {
  if (welcomeWin) {
    welcomeWin.show()
    welcomeWin.focus()
    return
  }
  if (!showOnboarding && !preview) return
  welcomePreview = preview
  const { workArea } = screen.getPrimaryDisplay()
  welcomeWin = new BrowserWindow({
    width: Math.min(1000, workArea.width - 32),
    height: Math.min(590, workArea.height - 32),
    show: false,
    autoHideMenuBar: true,
    icon: windowIconPath(),
    webPreferences: { preload: join(__dirname, 'welcome-preload.mjs'), sandbox: false }
  })
  welcomeWin.loadFile(join(__dirname, 'welcome.html'))
  welcomeWin.once('ready-to-show', () => {
    welcomeWin.center()
    welcomeWin.show()
  })
  welcomeWin.once('closed', () => { welcomeWin = null })
}

ipcMain.on('open-onboarding', event => {
  if (event.sender === preferencesWin?.webContents) createWelcomeWindow(true)
})

ipcMain.handle('onboarding-is-preview', event => event.sender === welcomeWin?.webContents && welcomePreview)

ipcMain.handle('complete-onboarding', (event, preset, preferences) => {
  if (event.sender !== welcomeWin?.webContents) return false
  if (welcomePreview) {
    setImmediate(() => welcomeWin?.close())
    return true
  }
  if (!showOnboarding) return false
  const patch = onboardingPatch(preset, preferences)
  if (!patch) return false
  const previousLogin = settings.get('openAtLogin')
  settings.set(patch)
  showOnboarding = false
  if (preset !== null) {
    if (patch.openAtLogin !== previousLogin) {
      autostartManager.setAutostartEnabled(patch.openAtLogin).catch(error => log.error('Rest Spark: setting login item', error))
    }
    breakPlanner.doNotDisturb(patch.monitorDnd)
    breakPlanner.replan()
  }
  updateTray()
  setImmediate(() => welcomeWin?.close())
  return true
})

function createContributorSettingsWindow () {
  if (contributorPreferencesWin) {
    contributorPreferencesWin.show()
    return
  }
  const modalPath = 'file://' + join(__dirname, '/contributor-preferences.html')
  contributorPreferencesWin = new BrowserWindow({
    x: displayManager.getDisplayX(-1, 735),
    y: displayManager.getDisplayY(),
    width: 735,
    show: false,
    autoHideMenuBar: true,
    icon: windowIconPath(),
    backgroundColor: 'EDEDED',
    webPreferences: {
      preload: join(__dirname, './contributor-preferences-preload.mjs'),
      sandbox: false
    }
  })
  contributorPreferencesWin.webContents.loadURL(modalPath)
  contributorPreferencesWin.once('ready-to-show', () => {
    contributorPreferencesWin.center()
    contributorPreferencesWin.show()
  })
  contributorPreferencesWin.once('closed', () => {
    contributorPreferencesWin = null
  })
}

function createSyncPreferencesWindow () {
  if (syncPreferencesWin) {
    syncPreferencesWin.show()
    return
  }

  const syncPreferencesUrl = 'https://my.stretchly.net/app/v1/sync'
  syncPreferencesWin = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    width: 1000,
    height: 700,
    icon: windowIconPath(),
    x: displayManager.getDisplayX(),
    y: displayManager.getDisplayY(),
    backgroundColor: 'whitesmoke',
    webPreferences: {
      preload: join(__dirname, './electron-bridge.mjs'),
      sandbox: false
    }
  })
  syncPreferencesWin.webContents.loadURL(syncPreferencesUrl)

  syncPreferencesWin.once('closed', () => {
    syncPreferencesWin = null
  })

  syncPreferencesWin.once('ready-to-show', () => {
    syncPreferencesWin.center()
    syncPreferencesWin.show()
  })
}

function planVersionCheck (seconds = 1) {
  if (settings.get('disableAppUpdateFeatures')) return
  if (updateChecker) {
    clearInterval(updateChecker)
    updateChecker = null
  }
  updateChecker = setTimeout(checkVersion, seconds * 1000)
}

function checkVersion () {
  if (settings.get('disableAppUpdateFeatures')) return
  if (settings.get('checkNewVersion')) {
    processWin.webContents.send('check-version',
      `v${app.getVersion()}`,
      settings.get('notifyNewVersion'),
      settings.get('silentNotifications')
    )
    planVersionCheck(3600 * 48)
  }
}

function startGentlePreview (type) {
  if (breakPlanner.autoBlocked || !settings.get(`${type}Notification`)) {
    breakPlanner.nextBreakAfterNotification()
    return
  }
  const seconds = Math.ceil(breakPlanner.notificationLead / 1000)
  const duration = settings.get(`${type}Duration`)
  const unit = duration < 60000 ? 'second' : 'minute'
  const time = new Intl.NumberFormat(i18next.language || settings.get('language'), { style: 'unit', unit })
    .format(duration / (unit === 'minute' ? 60000 : 1000))
  const title = i18next.t(type === 'microbreak' ? 'prd11.shortPreview' : 'prd11.longPreview', { seconds })
  const body = i18next.t(type === 'microbreak' ? 'prd11.shortPreviewBody' : 'prd11.longPreviewBody', { time })
  gentlePreviewType = type
  processWin?.webContents.send('show-gentle-preview', title, body, settings.get('silentNotifications'))
  breakPlanner.nextBreakAfterNotification()
  updateTray()
}

function cancelGentlePreview () {
  if (!gentlePreviewType) return
  gentlePreviewType = null
  processWin?.webContents.send('close-gentle-preview')
}

function getBlurredBackgroundWindowOptions () {
  if (!settings.get('blurredBackground')) {
    return {}
  }

  switch (process.platform) {
    case 'darwin':
      return {
        vibrancy: 'hud',
        visualEffectState: 'active'
      }
    default:
      return {}
  }
}

function loadBreakWindow (session, window, url) {
  const fail = (error) => {
    if (session !== activeBreak || window.isDestroyed()) return
    log.error('Rest Spark: break window failed to load', error)
    window.destroy()
  }
  const timer = setTimeout(() => fail(new Error('Break renderer did not become ready')), 12000)
  window.webContents.once('render-process-gone', (_event, details) => fail(details.reason))
  window.once('closed', () => {
    clearTimeout(timer)
    setImmediate(() => {
      if (session !== activeBreak) return
      const windows = session.type === 'microbreak' ? microbreakWins : breakWins
      if (windows?.some(candidate => !candidate.isDestroyed())) return
      if (session.type === 'microbreak') finishMicrobreak(false)
      else finishBreak(false)
    })
  })
  window.loadURL(url).catch(fail)
  return () => clearTimeout(timer)
}

function startMicrobreak () {
  // don't start another break if break running
  if (microbreakWins || breakWins) {
    log.warn('Rest Spark: a reminder is already opening or running, not starting Mini break')
    return
  }

  cancelGentlePreview()
  const breakDuration = settings.get('microbreakDuration')
  const strictMode = settings.get('microbreakStrictMode')
  const postponesLimit = settings.get('microbreakPostponesLimit')
  const postponableDurationPercent = settings.get('microbreakPostponableDurationPercent')
  const postponable = settings.get('microbreakPostpone') &&
    breakPlanner.postponesNumber < postponesLimit && postponesLimit > 0
  const showBreaksAsRegularWindows = settings.get('showBreaksAsRegularWindows')

  const modalPath = 'file://' + join(__dirname, '/microbreak.html')
  microbreakWins = []
  const session = { type: 'microbreak', started: Date.now(), breakDuration, strictMode, postponable, postponableDurationPercent, ready: false }
  activeBreak = session

  const idea = nextIdea || (settings.get('ideas') ? microbreakIdeas.randomElement : [''])
  nextIdea = null

  if (!settings.get('silentNotifications')) {
    const sound = settings.get('miniBreakStartSound')
    if (sound !== 'silence') {
      processWin.webContents.send('play-sound', sound, settings.get('volume'))
    }
  }

  ipcMain.handle('send-mini-break-data', event => {
    if (!isCurrentBreakSender('microbreak', event.sender)) return []
    return [idea, session.started, breakDuration, strictMode, postponable, postponableDurationPercent,
      danger, settings.get('breakHealthMode'), settings.get('microbreakPostponeTime')]
  })

  for (let localDisplayId = 0; localDisplayId < displayManager.getDisplayCount(); localDisplayId++) {
    const windowOptions = {
      width: Math.floor(displayManager.getDisplayWidth(localDisplayId) * settings.get('breakWindowWidth')),
      height: Math.floor(displayManager.getDisplayHeight(localDisplayId) * settings.get('breakWindowHeight')),
      autoHideMenuBar: true,
      icon: windowIconPath(),
      resizable: false,
      frame: showBreaksAsRegularWindows,
      show: false,
      backgroundThrottling: false,
      transparent: !showBreaksAsRegularWindows,
      ...getBlurredBackgroundWindowOptions(),
      skipTaskbar: !showBreaksAsRegularWindows,
      focusable: showBreaksAsRegularWindows,
      alwaysOnTop: !showBreaksAsRegularWindows,
      hasShadow: false,
      title: BRAND.name,
      titleBarStyle: process.platform === 'darwin' ? (showBreaksAsRegularWindows ? 'default' : 'hidden') : undefined,
      titleBarOverlay: process.platform === 'darwin' ? !showBreaksAsRegularWindows : undefined,
      webPreferences: {
        preload: join(__dirname, './microbreak-preload.mjs'),
        sandbox: false
      }
    }

    if (settings.get('fullscreen') && process.platform !== 'darwin') {
      windowOptions.width = displayManager.getDisplayWidth(localDisplayId)
      windowOptions.height = displayManager.getDisplayHeight(localDisplayId)
      windowOptions.x = displayManager.getDisplayX(localDisplayId, 0, true)
      windowOptions.y = displayManager.getDisplayY(localDisplayId, 0, true)
    } else if (!(settings.get('fullscreen') && process.platform === 'win32')) {
      windowOptions.x = displayManager.getDisplayX(localDisplayId, windowOptions.width, false)
      windowOptions.y = displayManager.getDisplayY(localDisplayId, windowOptions.height, false)
    }

    let microbreakWinLocal = new BrowserWindow(windowOptions)
    // seems to help with multiple-displays problems
    microbreakWinLocal.setSize(windowOptions.width, windowOptions.height)

    microbreakWinLocal.once('ready-to-show', () => {
      log.info('Stretchly: ready-to-show fired')
    })

    const onLoaded = event => {
      if (activeBreak !== session || event.sender !== microbreakWinLocal.webContents) return
      ipcMain.off('mini-break-loaded', onLoaded)
      markLoaded()
      log.info('Stretchly: Mini break window loaded')
      if (showBreaksAsRegularWindows) {
        microbreakWinLocal.show()
      } else {
        microbreakWinLocal.showInactive()
      }

      log.info(`Stretchly: showing window ${localDisplayId + 1} of ${displayManager.getDisplayCount()}`)
      if (process.platform === 'darwin') {
        if (showBreaksAsRegularWindows) {
          microbreakWinLocal.setFullScreen(settings.get('fullscreen'))
        } else {
          microbreakWinLocal.setMinimizable(false)
          microbreakWinLocal.setClosable(false)
          microbreakWinLocal.setKiosk(settings.get('fullscreen'))
        }
      }
      if (session.awaitingFinish) microbreakWinLocal.webContents.send('enter-manual-await', 'microbreak')
      if (!session.ready) {
        session.ready = true
        breakPlanner.emit('microbreakStarted', true, session.started, session.breakDuration)
        const shortcut = settings.get('endBreakShortcut')
        if (shortcut && globalShortcut.register(shortcut, () => handleBreakAction(session, 'shortcut'))) {
          session.shortcut = shortcut
        }
        log.info('Stretchly: starting Mini break')
      }
      if (!settings.get('fullscreen') && process.platform !== 'darwin') {
        setTimeout(() => {
          microbreakWinLocal?.center()
        }, 0)
      }
      updateTray()
    }
    ipcMain.on('mini-break-loaded', onLoaded)
    microbreakWinLocal.once('closed', () => ipcMain.off('mini-break-loaded', onLoaded))

    const markLoaded = loadBreakWindow(session, microbreakWinLocal, modalPath)
    microbreakWinLocal.setVisibleOnAllWorkspaces(true)
    microbreakWinLocal.setAlwaysOnTop(!showBreaksAsRegularWindows, 'pop-up-menu')
    if (microbreakWinLocal) {
      microbreakWinLocal.on('close', (e) => {
        e.preventDefault()
        handleBreakAction(session, 'skip')
      })
      microbreakWinLocal.once('closed', () => {
        microbreakWinLocal = null
      })
    }
    microbreakWins.push(microbreakWinLocal)

    if (!settings.get('allScreens')) {
      if (displayManager.getDisplayCount() > 1) {
        log.info('Stretchly: not showing on more Monitors as it is disabled.')
      }
      break
    }
  }
  if (process.platform === 'darwin') {
    if (app.dock.isVisible) {
      app.dock.hide()
    }
  }
}

function startBreak () {
  if (breakWins || microbreakWins) {
    log.warn('Rest Spark: a reminder is already opening or running, not starting Long break')
    return
  }

  cancelGentlePreview()
  const breakDuration = settings.get('breakDuration')
  const strictMode = settings.get('breakStrictMode')
  const postponesLimit = settings.get('breakPostponesLimit')
  const postponableDurationPercent = settings.get('breakPostponableDurationPercent')
  const postponable = settings.get('breakPostpone') &&
    breakPlanner.postponesNumber < postponesLimit && postponesLimit > 0
  const showBreaksAsRegularWindows = settings.get('showBreaksAsRegularWindows')

  const modalPath = 'file://' + join(__dirname, '/break.html')
  breakWins = []
  const session = { type: 'break', started: Date.now(), breakDuration, strictMode, postponable, postponableDurationPercent, ready: false }
  activeBreak = session

  const defaultNextIdea = settings.get('ideas') ? breakIdeas.randomElement : ['', '']
  const idea = nextIdea ? (nextIdea.map((val, index) => val || defaultNextIdea[index])) : defaultNextIdea
  nextIdea = null

  if (!settings.get('silentNotifications')) {
    const sound = settings.get('longBreakStartSound')
    if (sound !== 'silence') {
      processWin.webContents.send('play-sound', sound, settings.get('volume'))
    }
  }

  ipcMain.handle('send-long-break-data', event => {
    if (!isCurrentBreakSender('break', event.sender)) return []
    return [idea, session.started, breakDuration, strictMode, postponable, postponableDurationPercent,
      danger, settings.get('breakHealthMode'), settings.get('breakPostponeTime')]
  })

  for (let localDisplayId = 0; localDisplayId < displayManager.getDisplayCount(); localDisplayId++) {
    const windowOptions = {
      width: Math.floor(displayManager.getDisplayWidth(localDisplayId) * settings.get('breakWindowWidth')),
      height: Math.floor(displayManager.getDisplayHeight(localDisplayId) * settings.get('breakWindowHeight')),
      autoHideMenuBar: true,
      icon: windowIconPath(),
      resizable: false,
      frame: showBreaksAsRegularWindows,
      show: false,
      backgroundThrottling: false,
      transparent: !showBreaksAsRegularWindows,
      ...getBlurredBackgroundWindowOptions(),
      skipTaskbar: !showBreaksAsRegularWindows,
      focusable: showBreaksAsRegularWindows,
      alwaysOnTop: !showBreaksAsRegularWindows,
      hasShadow: false,
      title: BRAND.name,
      titleBarStyle: process.platform === 'darwin' ? (showBreaksAsRegularWindows ? 'default' : 'hidden') : undefined,
      titleBarOverlay: process.platform === 'darwin' ? !showBreaksAsRegularWindows : undefined,
      webPreferences: {
        preload: join(__dirname, './break-preload.mjs'),
        sandbox: false
      }
    }

    if (settings.get('fullscreen') && process.platform !== 'darwin') {
      windowOptions.width = displayManager.getDisplayWidth(localDisplayId)
      windowOptions.height = displayManager.getDisplayHeight(localDisplayId)
      windowOptions.x = displayManager.getDisplayX(localDisplayId, 0, true)
      windowOptions.y = displayManager.getDisplayY(localDisplayId, 0, true)
    } else if (!(settings.get('fullscreen') && process.platform === 'win32')) {
      windowOptions.x = displayManager.getDisplayX(localDisplayId, windowOptions.width, false)
      windowOptions.y = displayManager.getDisplayY(localDisplayId, windowOptions.height, false)
    }

    let breakWinLocal = new BrowserWindow(windowOptions)
    // seems to help with multiple-displays problems
    breakWinLocal.setSize(windowOptions.width, windowOptions.height)

    breakWinLocal.once('ready-to-show', () => {
      log.info('Stretchly: ready-to-show fired')
    })

    const onLoaded = event => {
      if (activeBreak !== session || event.sender !== breakWinLocal.webContents) return
      ipcMain.off('long-break-loaded', onLoaded)
      markLoaded()
      log.info('Stretchly: Long break window loaded')
      if (showBreaksAsRegularWindows) {
        breakWinLocal.show()
      } else {
        breakWinLocal.showInactive()
      }

      log.info(`Stretchly: showing window ${localDisplayId + 1} of ${displayManager.getDisplayCount()}`)
      if (process.platform === 'darwin') {
        if (showBreaksAsRegularWindows) {
          breakWinLocal.setFullScreen(settings.get('fullscreen'))
        } else {
          breakWinLocal.setMinimizable(false)
          breakWinLocal.setClosable(false)
          breakWinLocal.setKiosk(settings.get('fullscreen'))
        }
      }
      if (session.awaitingFinish) breakWinLocal.webContents.send('enter-manual-await', 'break')
      if (!session.ready) {
        session.ready = true
        breakPlanner.emit('breakStarted', true, session.started, session.breakDuration)
        const shortcut = settings.get('endBreakShortcut')
        if (shortcut && globalShortcut.register(shortcut, () => handleBreakAction(session, 'shortcut'))) {
          session.shortcut = shortcut
        }
        log.info('Stretchly: starting Long break')
      }

      if (!settings.get('fullscreen') && process.platform !== 'darwin') {
        setTimeout(() => {
          breakWinLocal?.center()
        }, 0)
      }
      updateTray()
    }
    ipcMain.on('long-break-loaded', onLoaded)
    breakWinLocal.once('closed', () => ipcMain.off('long-break-loaded', onLoaded))

    const markLoaded = loadBreakWindow(session, breakWinLocal, modalPath)
    breakWinLocal.setVisibleOnAllWorkspaces(true)
    breakWinLocal.setAlwaysOnTop(!showBreaksAsRegularWindows, 'pop-up-menu')
    if (breakWinLocal) {
      breakWinLocal.on('close', (e) => {
        e.preventDefault()
        handleBreakAction(session, 'skip')
      })
      breakWinLocal.once('closed', () => {
        breakWinLocal = null
      })
    }
    breakWins.push(breakWinLocal)

    if (!settings.get('allScreens')) {
      if (displayManager.getDisplayCount() > 1) {
        log.info('Stretchly: not showing on more Monitors as it is disabled.')
      }
      break
    }
  }
  if (process.platform === 'darwin') {
    if (app.dock.isVisible) {
      app.dock.hide()
    }
  }
}

function breakComplete (shouldPlaySound, windows, breakType) {
  if (activeBreak?.shortcut) globalShortcut.unregister(activeBreak.shortcut)
  if (activeBreak) ipcMain.removeHandler(activeBreak.type === 'microbreak' ? 'send-mini-break-data' : 'send-long-break-data')
  activeBreak = null
  if (!windows) return null
  if (shouldPlaySound && !settings.get('silentNotifications')) {
    const audio = breakType === 'mini' ? 'miniBreakAudio' : 'longBreakAudio'
    processWin.webContents.send('play-sound', settings.get(audio), settings.get('volume'))
  }
  if (process.platform === 'darwin' && settings.get('showBreaksAsRegularWindows')) {
    // Regular reminder windows may have taken focus from the prior app.
    Menu.sendActionToFirstResponder('hide:')
  }
  return closeWindows(windows)
}

function increaseDanger (amount) {
  if (!settings.get('breakHealthMode')) {
    return
  }
  danger = Math.min(danger + amount, 10)
  log.info(`Stretchly: danger increased to ${danger}`)
}

function decreaseDanger (amount) {
  if (!settings.get('breakHealthMode')) {
    return
  }
  danger = Math.max(danger - amount, 0)
  log.info(`Stretchly: danger decreased to ${danger}`)
}

function enterManualAwaitPhase (type, shouldPlaySound) {
  const isMini = type === 'mini'
  const manualSettingKey = isMini ? 'miniBreakManualFinish' : 'longBreakManualFinish'
  if (!settings.get(manualSettingKey) || !activeBreak) return
  activeBreak.awaitingFinish = true
  if (shouldPlaySound && !settings.get('silentNotifications')) {
    const audioKey = isMini ? 'miniBreakAudio' : 'longBreakAudio'
    processWin.webContents.send('play-sound', settings.get(audioKey), settings.get('volume'))
  }
  const wins = isMini ? microbreakWins : breakWins
  if (wins) {
    wins.forEach(w => {
      if (w && !w.isDestroyed()) {
        w.webContents.send('enter-manual-await', isMini ? 'microbreak' : 'break')
      }
    })
  }
  log.info('Stretchly: entering manual finish phase (' + (isMini ? 'Mini' : 'Long') + ' break)')
}

const enterMiniBreakManualContinuation = (shouldPlaySound) => enterManualAwaitPhase('mini', shouldPlaySound)
const enterLongBreakManualContinuation = (shouldPlaySound) => enterManualAwaitPhase('long', shouldPlaySound)

function finishMicrobreak (shouldPlaySound = true, shouldPlanNext = true) {
  microbreakWins = breakComplete(shouldPlaySound, microbreakWins, 'mini')
  log.info(`Stretchly: finishing Mini break (shouldPlanNext: ${shouldPlanNext})`)
  if (shouldPlanNext) {
    breakPlanner.nextBreak()
  } else {
    breakPlanner.clear()
  }
  updateTray()
}

function finishBreak (shouldPlaySound = true, shouldPlanNext = true) {
  breakWins = breakComplete(shouldPlaySound, breakWins, 'long')
  log.info(`Stretchly: finishing Long break (shouldPlanNext: ${shouldPlanNext})`)
  if (shouldPlanNext) {
    breakPlanner.nextBreak()
  } else {
    breakPlanner.clear()
  }
  updateTray()
}

function postponeMicrobreak () {
  increaseDanger(1)
  microbreakWins = breakComplete(false, microbreakWins, 'mini')
  breakPlanner.postponeCurrentBreak()
  log.info('Stretchly: postponing Mini break')
  updateTray()
}

function postponeBreak () {
  increaseDanger(1)
  breakWins = breakComplete(false, breakWins, 'long')
  breakPlanner.postponeCurrentBreak()
  log.info('Stretchly: postponing Long break')
  updateTray()
}

function skipToMicrobreak (delay) {
  if (activeBreak?.strictMode) return
  if (microbreakWins) {
    increaseDanger(1)
    microbreakWins = breakComplete(false, microbreakWins)
  }
  if (breakWins) {
    increaseDanger(2)
    breakWins = breakComplete(false, breakWins)
  }
  if (delay) {
    breakPlanner.skipToMicrobreak(delay)
    log.info(`Stretchly: skipping to Mini break in ${delay}ms`)
  } else {
    breakPlanner.skipToMicrobreak()
    log.info('Stretchly: skipping to Mini break')
  }
  updateTray()
}

function skipToBreak (delay) {
  if (activeBreak?.strictMode) return
  if (microbreakWins) {
    increaseDanger(1)
    microbreakWins = breakComplete(false, microbreakWins)
  }
  if (breakWins) {
    increaseDanger(2)
    breakWins = breakComplete(false, breakWins)
  }
  if (delay) {
    breakPlanner.skipToBreak(delay)
    log.info(`Stretchly: skipping to Long break in ${delay}ms`)
  } else {
    breakPlanner.skipToBreak()
    log.info('Stretchly: skipping to Long break')
  }
  updateTray()
}

function resetBreaks () {
  if (activeBreak?.strictMode) return
  if (microbreakWins) {
    microbreakWins = breakComplete(false, microbreakWins)
  }
  if (breakWins) {
    breakWins = breakComplete(false, breakWins)
  }
  danger = 0
  log.info(`Stretchly: danger reset to ${danger}`)
  breakPlanner.reset()
  log.info('Stretchly: resetting breaks')
  updateTray()
}

function loadIdeas () {
  let longBreakIdeasData
  let miniBreakIdeasData
  if (settings.get('useIdeasFromSettings')) {
    longBreakIdeasData = settings.get('breakIdeas')
    miniBreakIdeasData = settings.get('microbreakIdeas')
    log.info('Stretchly: loading custom break ideas from preferences file')
  } else {
    const t = i18next.getFixedT('en')
    miniBreakIdeasData = Object.keys(t('miniBreakIdeas',
      { returnObjects: true }))
      .map((item) => {
        return { data: i18next.t(`miniBreakIdeas.${item}.text`), enabled: true }
      })

    longBreakIdeasData = Object.keys(t('longBreakIdeas',
      { returnObjects: true }))
      .map((item) => {
        return { data: [i18next.t(`longBreakIdeas.${item}.title`), i18next.t(`longBreakIdeas.${item}.text`)], enabled: true }
      })
    log.info('Stretchly: loading default break ideas')
  }

  breakIdeas = new IdeasLoader(longBreakIdeasData).ideas()
  microbreakIdeas = new IdeasLoader(miniBreakIdeasData).ideas()
}

function pauseBreaks (milliseconds) {
  if (activeBreak?.strictMode && !settings.get('showTrayMenuInStrictMode')) return
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return
  breakPlanner.pause(milliseconds)
  if (microbreakWins) finishMicrobreak(false, false)
  if (breakWins) finishBreak(false, false)
  updateTray()
}

function resumeBreaks () {
  breakPlanner.resume()
  updateTray()
}

function createPreferencesWindow () {
  if (preferencesWin) {
    preferencesWin.show()
    return
  }
  const modalPath = 'file://' + join(__dirname, '/preferences.html')
  const maxHeight = screen
    .getDisplayNearestPoint(screen.getCursorScreenPoint())
    .workAreaSize.height * 0.9
  preferencesWin = new BrowserWindow({
    autoHideMenuBar: true,
    show: false,
    backgroundThrottling: false,
    icon: windowIconPath(),
    width: 860,
    height: 740,
    maxHeight: Math.round(maxHeight),
    x: displayManager.getDisplayX(-1, 860),
    y: displayManager.getDisplayY(-1, 740),
    backgroundColor: '#EDEDED',
    webPreferences: {
      preload: join(__dirname, './preferences-preload.mjs'),
      sandbox: false
    }
  })
  preferencesWin.webContents.loadURL(modalPath)
  preferencesWin.once('ready-to-show', () => {
    preferencesWin.center()
    preferencesWin.show()
  })
  preferencesWin.once('closed', () => {
    preferencesWin = null
  })
}

function traySnapshot () {
  const type = breakPlanner._scheduledBreakType
  const blockers = []
  if (breakPlanner.dndManager.isOnDnd) blockers.push('focusActive')
  if (breakPlanner.naturalBreaksManager.isSchedulerCleared) blockers.push('idle')
  if (breakPlanner.powerBlocks.size > 0) blockers.push('power')
  if (breakPlanner.appExclusionsManager.isSchedulerCleared) blockers.push('exclusion')
  const remaining = breakPlanner.timeToNextBreak
  const locked = Boolean(activeBreak?.strictMode)
  const view = trayPanelOptions ? 'options' : breakPlanner.isPaused ? 'paused' : blockers.length ? 'protected' : 'running'
  return {
    view,
    type,
    blockers,
    locked,
    active: breakPlanner.breakInProgress,
    pauseUntil: breakPlanner.manualPauseUntil,
    nextAt: Number.isFinite(remaining) ? Date.now() + Math.max(0, remaining) : null,
    progress: breakPlanner.progressPercentage,
    duration: settings.get(`${type}Duration`),
    focus: breakPlanner.dndManager.status,
    canRest: !breakPlanner.breakInProgress && !breakPlanner.powerBlocks.size && (settings.get('microbreak') || settings.get('break')),
    language: settings.get('language'),
    preset: presetForSchedule(settings.store),
    choices: trayPanelOptions ? pauseChoices(key => settings.get(key)) : [],
    cadence: ['microbreak', 'break'].map(key => ({
      enabled: settings.get(key),
      interval: settings.get(key === 'break' ? 'longBreakInterval' : 'microbreakInterval'),
      duration: settings.get(`${key}Duration`)
    }))
  }
}

function placeTrayPanel (view) {
  const anchor = appIcon.getBounds()
  const { workArea } = screen.getDisplayMatching(anchor)
  const bounds = popoverBounds(anchor, workArea, view)
  const current = trayPanel.getBounds()
  if (Object.keys(bounds).some(key => bounds[key] !== current[key])) trayPanel.setBounds(bounds)
  trayPanel.view = view
}

async function toggleTrayPanel () {
  if (activeBreak?.strictMode && !settings.get('showTrayMenuInStrictMode')) return
  if (trayPanel?.isVisible()) {
    trayPanel.hide()
    return
  }
  if (trayPanel?.webContents.isLoading()) return
  trayPanelOptions = false
  if (!trayPanel) {
    trayPanel = new BrowserWindow({
      width: 360,
      height: 420,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: true,
      webPreferences: { preload: join(__dirname, 'tray-popover-preload.mjs'), sandbox: false }
    })
    trayPanel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    trayPanel.on('blur', () => trayPanel?.hide())
    trayPanel.on('hide', () => trayPanel?.webContents.send('popover-visibility', false))
    trayPanel.on('closed', () => { trayPanel = null })
    await trayPanel.loadFile(join(__dirname, 'tray-popover.html'))
  }
  if (!appIcon || !trayPanel) return
  placeTrayPanel(traySnapshot().view)
  trayPanel.show()
  trayPanel.webContents.send('popover-visibility', true)
}

ipcMain.handle('focus-status', () => breakPlanner?.dndManager.status ?? 'unknown')

ipcMain.handle('popover-read', event => {
  if (event.sender !== trayPanel?.webContents || !trayPanel.isVisible()) return null
  breakPlanner.checkManualPause()
  const state = traySnapshot()
  if (state.view !== trayPanel.view) placeTrayPanel(state.view)
  return state
})

ipcMain.handle('popover-action', (event, action, choice) => {
  if (event.sender !== trayPanel?.webContents || !trayPanel.isVisible()) return false
  const state = traySnapshot()
  switch (action) {
    case 'options':
      if (!state.locked) trayPanelOptions = true
      break
    case 'back':
      trayPanelOptions = false
      break
    case 'select': {
      if (!trayPanelOptions || state.locked) return false
      const option = state.choices.find(item => item.id === choice)
      if (!option) return false
      pauseBreaks(option.until - Date.now())
      trayPanelOptions = false
      break
    }
    case 'resume':
      if (state.view !== 'paused') return false
      resumeBreaks()
      break
    case 'rest':
      if (!state.canRest) return false
      trayPanel.hide()
      if (settings.get('microbreak')) skipToMicrobreak()
      else skipToBreak()
      break
    case 'settings':
      trayPanel.hide()
      createPreferencesWindow()
      break
    case 'dismiss':
      trayPanel.hide()
      break
    default:
      return false
  }
  return true
})

function updateTray () {
  if (gentlePreviewType && (breakPlanner?.autoBlocked || !settings?.get(`${gentlePreviewType}Notification`))) cancelGentlePreview()
  if (process.platform === 'darwin') {
    if (app.dock.isVisible) {
      app.dock.hide()
    }
  }

  if (!appIcon && !settings.get('showTrayIcon')) {
    return
  }

  if (settings.get('showTrayIcon')) {
    if (!appIcon) {
      appIcon = new Tray(trayImage())
      appIcon.on('double-click', () => {
        createPreferencesWindow()
      })
      if (process.platform === 'darwin') {
        appIcon.on('click', () => toggleTrayPanel().catch(error => log.error('Rest Spark: opening tray panel', error)))
        appIcon.on('right-click', () => {
          trayPanel?.hide()
          appIcon.popUpContextMenu(Menu.buildFromTemplate(currentTrayMenuTemplate))
        })
      } else {
        appIcon.on('click', () => appIcon.popUpContextMenu(Menu.buildFromTemplate(currentTrayMenuTemplate)))
      }
    }
    if (!trayUpdateIntervalObj) {
      trayUpdateIntervalObj = setInterval(updateTray, 10000)
    }

    if (process.platform === 'darwin') appIcon.setTitle(trayStatusTitle(trayIconParams()), { fontType: 'monospacedDigit' })
    updateToolTip()

    const newTrayIconPath = trayIconPath()
    if (newTrayIconPath !== currentTrayIconPath) {
      appIcon.setImage(trayImage())
      currentTrayIconPath = newTrayIconPath
    }

    const newTrayMenuTemplate = getTrayMenuTemplate()
    if (JSON.stringify(newTrayMenuTemplate) !== JSON.stringify(currentTrayMenuTemplate)) {
      const trayMenu = Menu.buildFromTemplate(newTrayMenuTemplate)
      if (process.platform !== 'darwin') appIcon.setContextMenu(trayMenu)
      currentTrayMenuTemplate = newTrayMenuTemplate
    }
  }
}

function getTrayMenuTemplate () {
  const trayMenu = []

  if (!settings.get('disableAppUpdateFeatures') && global.isNewVersion) {
    trayMenu.push({
      label: i18next.t('main.downloadLatestVersion'),
      click: function () {
        shell.openExternal(BRAND.releases)
      }
    }, {
      type: 'separator'
    })
  }

  const statusMessage = new StatusMessages({
    breakPlanner,
    settings,
    i18next,
    humanizeDuration
  }).trayMessage

  if (statusMessage !== '') {
    const messages = statusMessage.split('\n')
    for (const index in messages) {
      trayMenu.push({
        label: messages[index],
        enabled: false
      })
    }

    trayMenu.push({
      type: 'separator'
    })
  }

  if ((breakPlanner.scheduler.reference === 'finishMicrobreak' && settings.get('microbreakStrictMode') &&
        !settings.get('showTrayMenuInStrictMode')) ||
      (breakPlanner.scheduler.reference === 'finishBreak' && settings.get('breakStrictMode') &&
      !settings.get('showTrayMenuInStrictMode'))
  ) {
    // empty menu, we are in strict mode
    return trayMenu
  }

  if (!(breakPlanner.isPaused || breakPlanner.dndManager.isOnDnd || breakPlanner.appExclusionsManager.isSchedulerCleared)) {
    let submenu = []
    if (settings.get('microbreak')) {
      submenu = submenu.concat([{
        label: i18next.t('main.toMicrobreak'),
        click: () => skipToMicrobreak()
      }])
    }
    if (settings.get('break')) {
      submenu = submenu.concat([{
        label: i18next.t('main.toBreak'),
        click: () => skipToBreak()
      }])
    }
    if (settings.get('break') || settings.get('microbreak')) {
      trayMenu.push({
        label: i18next.t('main.skipToTheNext'),
        submenu
      })
    }
  }

  if (breakPlanner.isPaused) {
    trayMenu.push({
      label: i18next.t('main.resume'),
      click: function () {
        resumeBreaks(false)
        updateTray()
      }
    })
  } else {
    trayMenu.push({
      label: i18next.t('main.pause'),
      submenu: [
        {
          label: i18next.t('main.forHour'),
          accelerator: settings.get('pauseBreaksFor1HourShortcut') || null,
          click: function () {
            pauseBreaks(3600 * 1000)
          }
        }, {
          label: i18next.t('main.for2Hours'),
          accelerator: settings.get('pauseBreaksFor2HoursShortcut') || null,
          click: function () {
            pauseBreaks(3600 * 2 * 1000)
          }
        }, {
          label: i18next.t('prd11.for3Hours'),
          click: () => pauseBreaks(3600 * 3 * 1000)
        }, {
          label: i18next.t('main.for5Hours'),
          accelerator: settings.get('pauseBreaksFor5HoursShortcut') || null,
          click: function () {
            pauseBreaks(3600 * 5 * 1000)
          }
        }, {
          label: i18next.t('main.untilMorning'),
          accelerator: settings.get('pauseBreaksUntilMorningShortcut') || null,
          click: function () {
            const morning = pauseChoices(key => settings.get(key)).at(-1)
            pauseBreaks(morning.until - Date.now())
          }
        }
      ]
    }, {
      label: i18next.t('main.resetBreaks'),
      click: resetBreaks
    })
  }

  trayMenu.push({
    type: 'separator'
  }, {
    label: i18next.t('main.preferences'),
    click: function () {
      createPreferencesWindow()
    }
  })

  if (global.isContributor) {
    trayMenu.push({
      label: i18next.t('main.contributorPreferences'),
      click: function () {
        createContributorSettingsWindow()
      }
    }, {
      label: i18next.t('main.syncPreferences'),
      click: function () {
        createSyncPreferencesWindow()
      }
    })
  }

  trayMenu.push({
    type: 'separator'
  }, {
    label: i18next.t('main.quitStretchly'),
    role: 'quit',
    click: function () {
      app.quit()
    }
  })

  return trayMenu
}

function updateToolTip () {
  let trayMessage = i18next.t('main.toolTipHeader')
  const message = new StatusMessages({
    breakPlanner,
    settings,
    i18next,
    humanizeDuration
  }).trayMessage
  if (message !== '') {
    trayMessage += '\n\n' + message
  }
  if (appIcon) {
    appIcon.setToolTip(trayMessage)
  }
}

function isCurrentBreakSender (type, sender) {
  const windows = type === 'microbreak' ? microbreakWins : breakWins
  return activeBreak?.type === type && windows?.some(window => window && !window.isDestroyed() && window.webContents === sender)
}

function handleBreakAction (session, action) {
  if (session !== activeBreak || !session.ready) return
  const { type, started, breakDuration, strictMode, postponable, postponableDurationPercent } = session
  const mini = type === 'microbreak'
  const amount = mini ? 1 : 2
  const finish = mini ? finishMicrobreak : finishBreak
  const passedPercent = (Date.now() - started) / breakDuration * 100
  if (passedPercent >= 100) {
    if (!session.awaitingFinish || action === 'postpone') return
    decreaseDanger(amount)
    finish(false)
    return
  }

  const allowed = breakActions(strictMode, postponable, passedPercent, postponableDurationPercent)
  if (allowed.postpone && (action === 'postpone' || action === 'shortcut')) {
    if (mini) postponeMicrobreak()
    else postponeBreak()
  } else if (allowed.skip && (action === 'skip' || action === 'shortcut')) {
    increaseDanger(amount)
    finish(false)
  }
}

for (const [channelType, type] of [['mini', 'microbreak'], ['long', 'break']]) {
  ipcMain.on(`postpone-${channelType}-break`, event => {
    if (isCurrentBreakSender(type, event.sender)) handleBreakAction(activeBreak, 'postpone')
  })
  ipcMain.on(`finish-${channelType}-break`, event => {
    if (isCurrentBreakSender(type, event.sender)) handleBreakAction(activeBreak, 'skip')
  })
}

ipcMain.handle('save-schedule', (event, patch) => {
  const result = saveSchedulePatch(settings, patch)
  if (result.ok) {
    if (['microbreakInterval', 'longBreakInterval'].some(key => Object.hasOwn(patch, key))) breakPlanner.replan()
    updateTray()
  }
  return result
})

ipcMain.on('save-setting', function (event, key, value) {
  if (key === 'themeSource' && normalizeThemeSource(value) !== value) return
  if (key === 'morningHour' && value !== 'sunrise' && (!Number.isInteger(value) || value < 0 || value > 23)) return

  if (key === 'isFirstRun' && value === true) settings.set('onboardingVersion', 0)

  if (key === 'naturalBreaks') {
    breakPlanner.naturalBreaks(value)
  }

  if (key === 'monitorDnd') {
    breakPlanner.doNotDisturb(value)
  }

  if (key === 'language') {
    i18next.changeLanguage(value)
  }

  if (key === 'longBreakAudio') {
    settings.set('miniBreakAudio', value)
  }

  if (key === 'showTrayIcon') {
    settings.set('showTrayIcon', value)
    if (value) {
      updateTray()
    } else {
      clearInterval(trayUpdateIntervalObj)
      trayUpdateIntervalObj = null
      trayPanel?.hide()
      appIcon.destroy()
      appIcon = null
    }
  }

  if (key === 'openAtLogin') {
    autostartManager.setAutostartEnabled(value)
  }

  if (key === 'breakHealthMode' && !value) {
    danger = 0
    log.info('Stretchly: danger reset after disabling breakHealthMode')
  }

  settings.set(key, value)
  if (['microbreakInterval', 'longBreakInterval', 'microbreak', 'break'].includes(key)) breakPlanner.replan()
  for (const type of ['microbreak', 'break']) {
    if (key === `${type}Notification` || key === `${type}NotificationInterval`) breakPlanner.updateNotificationSchedule(type)
  }

  updateTray()
})

ipcMain.on('update-tray', function (event) {
  updateTray()
})

ipcMain.on('restore-defaults', (event) => {
  const dialogOpts = {
    type: 'question',
    title: i18next.t('main.restoreDefaults'),
    message: i18next.t('main.warning'),
    buttons: [i18next.t('main.continue'), i18next.t('main.cancel')]
  }
  dialog.showMessageBox(dialogOpts).then(async (returnValue) => {
    if (returnValue.response === 0) {
      log.info('Stretchly: restoring default settings')
      settings.store = { ...defaultSettings, isFirstRun: false, __internal__: settings.get('__internal__') }
      initialize(false)
      event.sender.reload()
    }
  })
})

ipcMain.on('play-sound', (event, sound) => {
  processWin?.webContents.send('play-sound', sound, settings.get('volume'), true)
})

ipcMain.handle('show-debug', (event) => {
  const reference = breakPlanner.scheduler.reference
  const timeleft = formatTimeRemaining(
    breakPlanner.scheduler.timeLeft, settings.get('language'),
    i18next, humanizeDuration
  )
  const breaknumber = breakPlanner.breakNumber
  const postponesnumber = breakPlanner.postponesNumber
  const doNotDisturb = breakPlanner.dndManager.isOnDnd
  let settingsFile = settings.path
  let logsFile = log.transports.file.getFile().path
  let imagesFolder = join(app.getPath('userData'), 'images')
  if (insideWindowsStore()) {
    settingsFile = settingsFile.replace('Roaming', 'Local\\Packages\\33881JanHovancik.stretchly_24fg4m0zq65je\\LocalCache\\Roaming')
    logsFile = logsFile.replace('Roaming', 'Local\\Packages\\33881JanHovancik.stretchly_24fg4m0zq65je\\LocalCache\\Roaming')
    imagesFolder = imagesFolder.replace('Roaming', 'Local\\Packages\\33881JanHovancik.stretchly_24fg4m0zq65je\\LocalCache\\Roaming')
  }
  return [
    reference,
    timeleft,
    breaknumber,
    postponesnumber,
    settingsFile,
    logsFile,
    doNotDisturb,
    imagesFolder
  ]
})

ipcMain.on('open-preferences', function (event) {
  createPreferencesWindow()
})

ipcMain.on('set-contributor', function (event) {
  const dir = app.getPath('userData')
  const contributorStampFile = `${dir}/stamp`
  writeFile(contributorStampFile, DateTime.now().toString(), () => { })
  global.isContributor = true
  log.info('Stretchly: Logged in. Thanks for your contributions!')
  if (preferencesWin) {
    preferencesWin.webContents.send('enable-contributor-preferences')
  }
  updateTray()
})

ipcMain.on('open-contributor-preferences', function () {
  createContributorSettingsWindow()
})

ipcMain.on('open-contributor-auth', function (event, provider) {
  if (myStretchlyWin) {
    myStretchlyWin.show()
    return
  }
  const myStretchlyUrl = `https://my.stretchly.net/app/v1?provider=${provider}`
  myStretchlyWin = new BrowserWindow({
    autoHideMenuBar: true,
    show: false,
    width: 1000,
    height: 700,
    icon: windowIconPath(),
    x: displayManager.getDisplayX(),
    y: displayManager.getDisplayY(),
    backgroundColor: 'whitesmoke',
    webPreferences: {
      preload: join(__dirname, './electron-bridge.mjs'),
      sandbox: false
    }
  })
  myStretchlyWin.webContents.loadURL(myStretchlyUrl)

  myStretchlyWin.once('closed', () => {
    myStretchlyWin = null
  })

  myStretchlyWin.once('ready-to-show', () => {
    myStretchlyWin.center()
    myStretchlyWin.show()
  })
})

ipcMain.on('open-sync-preferences', () => {
  createSyncPreferencesWindow()
})

ipcMain.handle('current-settings', (event) => {
  return settings.store
})

ipcMain.handle('restore-remote-settings', (event, remoteSettings) => {
  log.info('Stretchly: restoring remote settings')
  settings.store = migrateSoundSettings({ ...remoteSettings, manualPauseUntil: settings.get('manualPauseUntil') })
  initialize(false)
})

ipcMain.handle('i18next-translate', (event, key, options) => {
  return i18next.t(key, options)
})

ipcMain.handle('i18next-dir', (event) => {
  return i18next.dir()
})

ipcMain.handle('settings-get', (event, key) => {
  return settings.get(key)
})

ipcMain.on('close-current-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    win.close()
  }
})

ipcMain.handle('get-window-bounds', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win.getBounds()
})

ipcMain.on('set-window-size', (event, width, height) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  win.setSize(width, height)
})

ipcMain.handle('get-version', (event) => {
  return app.getVersion()
})

ipcMain.handle('resolve-local-image', (event, filename) => {
  const imagesPath = join(app.getPath('userData'), 'images')
  return resolveLocalImage(imagesPath, filename)
})
