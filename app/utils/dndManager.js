import EventEmitter from 'events'
import log from 'electron-log/main.js'
import { getFocusAssist } from 'windows-focus-assist'
import dbus from '@particle/dbus-next'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseFocusAssertions } from './focusAssertions.js'

class DndManager extends EventEmitter {
  constructor (settings) {
    super()
    this.settings = settings
    this.monitorDnd = settings.get('monitorDnd')
    this.timer = null
    this.isOnDnd = false
    this.status = this.monitorDnd ? 'unknown' : 'disabled'
    this.generation = 0
    this.pendingCheck = null

    this._unsupDEErrorShown = false
    this._errorLogged = {}

    if (this.monitorDnd) {
      this.start()
    }
  }

  start () {
    if (this.timer) return
    this.monitorDnd = true
    this.refresh()
    this.timer = setInterval(() => this.refresh(), 1000)
    log.info('Stretchly: starting Do Not Disturb monitoring')
    if (process.platform === 'linux') {
      log.info(`System: Your Desktop seems to be ${this._desktopEnviroment}.`)
    }
  }

  stop () {
    this.monitorDnd = false
    this.generation += 1
    this.pendingCheck = null
    this._publish('disabled')
    clearTimeout(this.timer)
    this.timer = null
    if (this.__sessionBus) {
      this.__sessionBus.disconnect()
      this.__sessionBus = null
    }
    log.info('Stretchly: stopping Do Not Disturb monitoring')
  }

  get _desktopEnviroment () {
    // https://specifications.freedesktop.org/mime-apps-spec/latest/file.html
    // https://specifications.freedesktop.org/menu-spec/latest/onlyshowin-registry.html
    return process.env.XDG_CURRENT_DESKTOP || 'unknown'
  }

  async _isDndEnabledLinux () {
    const de = this._desktopEnviroment.toLowerCase()
    const sessionBus = this._getOrCreateSessionBus()
    switch (true) {
      case de.includes('kde'):
        try {
          const obj = await sessionBus.getProxyObject('org.freedesktop.Notifications', '/org/freedesktop/Notifications')
          const properties = obj.getInterface('org.freedesktop.DBus.Properties')
          const dndEnabled = await properties.Get('org.freedesktop.Notifications', 'Inhibited')
          if (await dndEnabled.value) {
            return true
          }
        } catch (e) {
          this._logErrorOnce('kde', e)
        }
        break
      case de.includes('xfce'):
        try {
          const obj = await sessionBus.getProxyObject('org.xfce.Xfconf', '/org/xfce/Xfconf')
          const properties = obj.getInterface('org.xfce.Xfconf')
          const dndEnabled = await properties.GetProperty('xfce4-notifyd', '/do-not-disturb')
          if (await dndEnabled.value) {
            return true
          }
        } catch (e) {
          this._logErrorOnce('xfce', e)
        }
        break
      case de.includes('gnome') || de.includes('unity'):
        try {
          const asyncExec = this._getOrCreateAsyncExec()
          const { stdout } = await asyncExec('gsettings get org.gnome.desktop.notifications show-banners')
          if (stdout.replace(/[^0-9a-zA-Z]/g, '') === 'false') {
            return true
          }
        } catch (e) {
          this._logErrorOnce('gnome/unity', e)
        }
        break
      case de.includes('cinnamon'):
        try {
          const asyncExec = this._getOrCreateAsyncExec()
          const { stdout } = await asyncExec('gsettings get org.cinnamon.desktop.notifications display-notifications')
          if (stdout.replace(/[^0-9a-zA-Z]/g, '') === 'false') {
            return true
          }
        } catch (e) {
          this._logErrorOnce('cinnamon', e)
        }
        break
      case de.includes('mate'):
        try {
          const asyncExec = this._getOrCreateAsyncExec()
          const { stdout } = await asyncExec('gsettings get org.mate.NotificationDaemon do-not-disturb')
          if (stdout.replace(/[^0-9a-zA-Z]/g, '') === 'true') {
            return true
          }
        } catch (e) {
          this._logErrorOnce('mate', e)
        }
        break
      case de.includes('lxqt'):
        return await this._getConfigValue('~/.config/lxqt/notifications.conf', 'doNotDisturb')
      default:
        if (!this._unsupDEErrorShown) {
          log.info(`Stretchly: ${this._desktopEnviroment} not supported for DND detection, yet.`)
          this._unsupDEErrorShown = true
        }
        return false
    }
  }

  _getOrCreateSessionBus () {
    if (!this.__sessionBus) {
      const bus = dbus.sessionBus()
      this.__sessionBus = bus
      bus.on('error', () => { this.__sessionBus = null })
      bus.on('close', () => { this.__sessionBus = null })
    }
    return this.__sessionBus
  }

  async _doNotDisturb () {
    // TODO also check for session state? https://github.com/felixrieseberg/electron-notification-state/tree/master#session-state
    if (this.monitorDnd) {
      if (process.platform === 'win32') {
        let wfa = 0
        try {
          wfa = getFocusAssist().value
        } catch (e) { wfa = -1 } // getFocusAssist() throw an error if OS isn't windows
        return wfa !== -1 && wfa !== 0
      } else if (process.platform === 'darwin') {
        try {
          const raw = await readFile(join(homedir(), 'Library/DoNotDisturb/DB/Assertions.json'), 'utf8')
          const state = parseFocusAssertions(JSON.parse(raw))
          if (state !== null) return state
          this._logErrorOnce('macos', new Error('Unsupported Focus assertions schema'))
        } catch (error) {
          this._logErrorOnce('macos', new Error(`Focus assertions unavailable (${error.code || 'invalid data'})`))
        }
        return null
      } else if (process.platform === 'linux') {
        return await this._isDndEnabledLinux()
      }
    } else {
      return false
    }
  }

  _getOrCreateAsyncExec () {
    if (!this.__asyncExec) {
      this.__asyncExec = promisify(exec)
    }
    return this.__asyncExec
  }

  async _getConfigValue (filePath, key) {
    try {
      const data = await readFile(filePath, 'utf8')
      const lines = data.split('\n')
      for (const line of lines) {
        const [configKey, value] = line.split('=')
        if (configKey.trim() === key) {
          return value.trim().toLowerCase() === 'true'
        }
      }
      return false
    } catch (e) {
      this._logErrorOnce(`config-read-${filePath}`, e)
      return false
    }
  }

  _logErrorOnce (environment, error) {
    const errorKey = `${environment}-${error.code || error.message.substring(0, 20)}`
    if (!this._errorLogged[errorKey]) {
      log.error(`Stretchly: DND detection error in ${environment}:`, error)
      this._errorLogged[errorKey] = true
    }
  }

  refresh () {
    if (!this.monitorDnd) return Promise.resolve()
    if (this.pendingCheck) return this.pendingCheck
    const generation = this.generation
    this.pendingCheck = this._doNotDisturb()
      .then(value => {
        if (generation !== this.generation) return
        this._publish(value === true ? 'active' : value === false ? 'inactive' : 'unknown')
      })
      .catch(error => {
        this._logErrorOnce(process.platform, error)
        if (generation === this.generation) this._publish('unknown')
      })
      .finally(() => {
        if (generation === this.generation) this.pendingCheck = null
      })
    return this.pendingCheck
  }

  _publish (status) {
    if (status === this.status) return
    const previous = this.isOnDnd
    this.status = status
    this.isOnDnd = status === 'active'
    if (previous !== this.isOnDnd) this.emit(this.isOnDnd ? 'dndStarted' : 'dndFinished')
    this.emit('statusChanged')
  }
}

export default DndManager
