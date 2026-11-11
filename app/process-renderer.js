import { BRAND, displayName } from './utils/brand.js'
import VersionChecker from './utils/versionChecker.js'

window.onload = async (e) => {
  window.stretchly.onPlaySound((file, volume) => {
    __electronLog.info(`Stretchly: playing audio/${file}.wav (volume: ${volume})`)
    const audio = new Audio(`audio/${file}.wav`)
    audio.volume = volume
    audio.play()
  })

  let preview
  let previewTimeout
  const closePreview = () => {
    clearTimeout(previewTimeout)
    preview?.close()
    preview = null
  }
  window.stretchly.onGentlePreview((title, body, silent) => {
    closePreview()
    if (Notification.permission !== 'granted') {
      __electronLog.info('Rest Spark: gentle preview unavailable without notification permission')
      return
    }
    preview = new Notification(title, { body, silent, icon: 'images/brand/restspark-icon-256.png' })
    previewTimeout = setTimeout(closePreview, 7000)
  })
  window.stretchly.onCloseGentlePreview(closePreview)

  window.stretchly.onCheckVersion(async (oldVersion, notify, silent) => {
    if (await window.global.getValue('isNewVersion') && notify) {
      notifyNewVersion(silent)
    } else {
      new VersionChecker()
        .latest()
        .then(async version => {
          if (version) {
            const cleanVersion = await window.semver.clean(version)
            __electronLog.info(`Stretchly: checking for new version (local: ${oldVersion}, remote: ${cleanVersion})`)
            if (await window.semver.valid(cleanVersion) && await window.semver.gt(cleanVersion, oldVersion)) {
              await window.global.setValue('isNewVersion', true)
              window.stretchly.updateTray()
              if (notify) {
                notifyNewVersion(silent)
              }
            }
          } else {
            __electronLog.info('Stretchly: could not check for new version')
          }
        })
        .catch(exception => __electronLog.error(exception))
    }
  })

  async function notifyNewVersion (silent) {
    const title = await window.utils.shouldShowNotificationTitle(await window.runtime.platform(), await window.runtime.getSystemVersion()) ? displayName(await window.settings.get('language')) : ''
    const notification = new Notification(title, {
      body: await window.i18next.t('process.newVersionAvailable'),
      silent,
      icon: 'images/brand/restspark-icon-256.png'
    })
    notification.onclick = () => window.electronApi.openExternal(BRAND.releases)
  }
}
