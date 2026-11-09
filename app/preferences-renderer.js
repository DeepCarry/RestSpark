import VersionChecker from './utils/versionChecker.js'
import { setSameWidths } from './utils/sameWidths.js'
import HtmlTranslate from './utils/htmlTranslate.js'

import './platform.js'

const versionChecker = new VersionChecker()

window.onload = async (e) => {
  const bounds = await window.stretchly.getWindowBounds()
  let initialSizeApplied = false
  const settings = await window.settings.currentSettings()
  if (settings.disableAppUpdateFeatures) {
    document.querySelector('[data-update-section]').classList.add('hidden')
  }

  if (settings.hideStrictModePreferences) {
    document.querySelectorAll('[data-strict-mode]').forEach(element => {
      element.classList.add('hidden')
    })
  }

  if (settings.hidePreferencesFileLocation) {
    document.querySelectorAll('[data-preferences-file]').forEach(element => {
      element.classList.add('hidden')
    })
  }

  document.documentElement.lang = settings.language
  new HtmlTranslate(document).translate()
  setWindowHeight()

  if (settings.customPreferencesMessage) {
    const customMessageDiv = document.createElement('div')
    customMessageDiv.className = 'custom-message'
    customMessageDiv.textContent = settings.customPreferencesMessage
    document.querySelector('.navigation').parentNode.insertBefore(customMessageDiv, document.querySelector('.navigation').nextSibling)
  }

  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    const imagesWithDarkVersion = document.querySelectorAll('[data-has-dark-version]')
    imagesWithDarkVersion.forEach(image => {
      // replace last occurance https://github.com/electron-userland/electron-builder/issues/5152
      const newSource = image.src.replace(/.([^.]*)$/, '-dark.' + '$1')
      image.src = newSource
    })
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    const imagesWithDarkVersion = document.querySelectorAll('[data-has-dark-version]')
    if (event.matches) {
      imagesWithDarkVersion.forEach(image => {
        const newSource = image.src.replace(/.([^.]*)$/, '-dark.' + '$1')
        image.src = newSource
      })
    } else {
      imagesWithDarkVersion.forEach(image => {
        const newSource = image.src.replace('-dark.', '.')
        image.src = newSource
      })
    }
  })

  document.ondragover = event =>
    event.preventDefault()

  document.ondrop = event =>
    event.preventDefault()

  document.onkeydown = async event => {
    if (event.key === 'd' && (event.ctrlKey || event.metaKey)) {
      const [
        reference, timeleft, breaknumber,
        postponesnumber, settingsfile, logsfile, doNotDisturb, imagesfolder
      ] = await window.stretchly.showDebug()
      const debugInfo = document.querySelector('.debug > :first-child')
      if (!debugInfo.classList.contains('hidden')) {
        debugInfo.classList.add('hidden')
      } else {
        debugInfo.classList.remove('hidden')
        document.querySelector('#reference').innerHTML = reference
        document.querySelector('#timeleft').innerHTML = timeleft
        document.querySelector('#breakNumber').innerHTML = breaknumber
        document.querySelector('#postponesNumber').innerHTML = postponesnumber
        document.querySelector('#settingsfile').innerHTML = settingsfile
        document.querySelector('#logsfile').innerHTML = logsfile
        document.querySelector('#imagesfolder').innerHTML = imagesfolder
        document.querySelector('#donotdisturb').innerHTML = doNotDisturb
        document.querySelector('#node').innerHTML = await window.runtime.node()
        document.querySelector('#chrome').innerHTML = await window.runtime.chrome()
        document.querySelector('#electron').innerHTML = await window.runtime.electron()
        document.querySelector('#platform').innerHTML = await window.runtime.platform()
        document.querySelector('#windowsStore').innerHTML = await window.runtime.windowsStore() || false
        document.querySelector('#windowsPortable').innerHTML = await window.runtime.windowsPortable() || false
      }
      setWindowHeight()
    }
  }

  window.stretchly.onTranslate(async () => {
    document.documentElement.lang = await window.settings.get('language')
    new HtmlTranslate(document).translate()
    const translatedSettings = await window.settings.currentSettings()
    await Promise.all(Array.from(document.querySelectorAll('[data-divisor]')).map(async range => {
      const settings = translatedSettings
      const divisor = range.dataset.divisor
      const output = range.closest('div').querySelector('output')
      setScheduleValue(range, settings[range.name] / divisor)
      const unit = output.dataset.unit
      output.innerHTML = await window.i18next.t(`utils.${unit}`, { count: Number(range.value) })
      document.querySelector('#longBreakEvery').closest('div').querySelector('output')
        .innerHTML = await window.i18next.t('utils.minutes', { count: realBreakInterval() })
    }))
    await updateScheduleChoices()
    await renderUpdateStatus()
    setWindowHeight()
  })

  window.stretchly.onEnableContributorPreferences(() => {
    showContributorPreferencesButton()
  })

  const showContributorPreferencesButton = () => {
    document.querySelectorAll('.contributor').forEach((item) => {
      item.classList.remove('hidden')
    })
    document.querySelectorAll('.become').forEach((item) => {
      item.classList.add('hidden')
    })
    document.querySelectorAll('.authenticate').forEach((item) => {
      item.classList.add('hidden')
    })
    setWindowHeight()
  }

  if (await window.global.getValue('isContributor')) {
    showContributorPreferencesButton()
  }

  document.querySelector('[name="contributorPreferences"]').onclick = (event) => {
    event.preventDefault()
    window.stretchly.openContributorPreferences()
  }

  document.querySelector('[name="syncPreferences"]').onclick = (event) => {
    event.preventDefault()
    window.stretchly.openSyncPreferences()
  }

  document.querySelector('.debug button').onclick = async (event) => {
    event.preventDefault()
    const toCopy = document.querySelector('#to-copy')
    await navigator.clipboard.writeText(toCopy.textContent)
    const copiedEl = document.createElement('span')
    copiedEl.innerHTML = ' copied!'
    event.target.parentNode.appendChild(copiedEl)
    setTimeout(() => copiedEl.remove(), 1275)
  }

  document.querySelectorAll('.navigation a:not([hidden])').forEach(element => {
    element.onclick = event => {
      event.preventDefault()
      event.target.closest('.navigation').childNodes.forEach(link => {
        if (link.classList) {
          link.classList.remove('active')
          link.removeAttribute('aria-current')
        }
      })
      event.target.closest('a').classList.add('active')
      event.target.closest('a').setAttribute('aria-current', 'page')

      const toBeDisplayed = document.querySelector(`.${event.target.closest('[data-section]').getAttribute('data-section')}`)
      document.querySelectorAll('body > div:not(.custom-message)').forEach(section => {
        if (section !== toBeDisplayed) {
          section.classList.add('hidden')
        } else {
          section.classList.remove('hidden')
        }
      })

      toBeDisplayed.scrollTop = 0
      setSameWidths()
      setWindowHeight()
    }
  })

  document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    const isNegative = checkbox.classList.contains('negative')
    checkbox.checked = isNegative ? !settings[checkbox.value] : settings[checkbox.value]
    checkbox.onchange = async () => {
      if (checkbox.classList.contains('enabletype') && !document.querySelector('.enabletype:checked')) {
        checkbox.checked = true
        window.alert(await window.i18next.t('preferences.schedule.cantDisableBoth'))
        return
      }
      window.settings.saveSettings(checkbox.value,
        isNegative ? !checkbox.checked : checkbox.checked)
    }
  })

  document.querySelectorAll('input[type="radio"]').forEach(radio => {
    let value
    switch (radio.value) {
      case 'true':
        value = true
        break
      case 'false':
        value = false
        break
      default:
        value = radio.value
    }
    radio.checked = settings[radio.name] === value
    radio.onchange = (event) => {
      window.settings.saveSettings(radio.name, value)
    }
  })

  document.querySelector('#language').value = settings.language
  document.querySelector('#language').onchange = (event) => {
    window.settings.saveSettings('language', event.target.value)
  }

  document.querySelector('#trayIconStyle').value = settings.trayIconStyle
  document.querySelector('#trayIconStyle').onchange = (event) => {
    window.settings.saveSettings('trayIconStyle', event.target.value)
  }

  await Promise.all(Array.from(document.querySelectorAll('[data-divisor]')).map(async range => {
    const divisor = range.dataset.divisor
    const output = range.closest('div').querySelector('output')
    setScheduleValue(range, settings[range.name] / divisor)
    const unit = output.dataset.unit
    output.innerHTML = await window.i18next.t(`utils.${unit}`, { count: Number(range.value) })
    document.querySelector('#longBreakEvery').closest('div').querySelector('output')
      .innerHTML = await window.i18next.t('utils.minutes', { count: realBreakInterval() })
    range.onchange = async event => {
      output.innerHTML = await window.i18next.t(`utils.${unit}`, { count: Number(range.value) })
      document.querySelector('#longBreakEvery').closest('div').querySelector('output')
        .innerHTML = await window.i18next.t('utils.minutes', { count: realBreakInterval() })
      window.settings.saveSettings(range.name, range.value * divisor)
      await updateScheduleChoices()
    }
    range.oninput = async event => {
      await updateScheduleChoices()
      output.innerHTML = await window.i18next.t(`utils.${unit}`, { count: Number(range.value) })
      document.querySelector('#longBreakEvery').closest('div').querySelector('output')
        .innerHTML = await window.i18next.t('utils.minutes', { count: realBreakInterval() })
    }
  }))

  await updateScheduleChoices()

  document.querySelectorAll('[data-preview-sound]').forEach(preview => {
    preview.onclick = (event) =>
      window.stretchly.playSound(preview.dataset.previewSound)
  })

  setWindowHeight()

  document.querySelector('#restore-defaults').onclick = (event) => {
    window.stretchly.restoreDefaults()
  }

  document.querySelectorAll('.about a').forEach((item) => {
    item.onclick = (event) => {
      event.preventDefault()
      if (item.classList.contains('file')) {
        window.electronApi.openPath(item.textContent)
      } else {
        window.electronApi.openExternal(item.href)
      }
    }
  })

  document.querySelector('[name="becomeContributor"]').onclick = () => {
    window.electronApi.openExternal('https://hovancik.net/stretchly/sponsor')
  }

  document.querySelector('[name="alreadyContributor"]').onclick = () => {
    document.querySelectorAll('.become').forEach((item) => {
      item.classList.add('hidden')
    })
    document.querySelectorAll('.authenticate').forEach((item) => {
      item.classList.remove('hidden')
    })
    setWindowHeight()
  }

  document.querySelectorAll('.authenticate a').forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault()
      window.stretchly.openContributorAuth(button.dataset.provider)
    }
  })

  const currentVersion = await window.stretchly.getVersion()
  document.querySelector('.version').textContent = currentVersion
  const updateStatus = document.querySelector('.update-status')
  let latestVersion
  const renderUpdateStatus = async () => {
    updateStatus.textContent = await window.i18next.t(latestVersion
      ? (latestVersion.replace(/^v/, '') === currentVersion ? 'settingsV1.latest' : 'settingsV1.available')
      : 'settingsV1.noRelease', { version: latestVersion })
  }
  const checkUpdates = async () => {
    const button = document.querySelector('#check-updates')
    button.disabled = true
    updateStatus.textContent = await window.i18next.t('settingsV1.checking')
    try {
      latestVersion = await versionChecker.latest()
      await renderUpdateStatus()
    } finally {
      button.disabled = false
    }
  }
  document.querySelector('#check-updates').onclick = checkUpdates
  document.querySelector('#themeSource').value = settings.themeSource
  document.querySelector('#themeSource').onchange = event => {
    window.settings.saveSettings('themeSource', event.target.value)
  }
  if (!settings.disableAppUpdateFeatures) checkUpdates()

  function setWindowHeight () {
    if (initialSizeApplied) return
    initialSizeApplied = true
    const width = Math.min(Math.max(bounds.width, 760), window.screen.availWidth)
    const height = Math.min(Math.max(bounds.height, 700), window.screen.availHeight * 0.9)
    window.stretchly.setWindowSize(Math.round(width), Math.round(height))
  }

  function setScheduleValue (control, value) {
    const saved = String(value)
    // Advanced preferences may contain a duration between the standard steps.
    if (!Array.from(control.options).some(option => option.value === saved)) {
      const option = document.createElement('option')
      option.value = saved
      control.appendChild(option)
    }
    control.value = saved
  }

  async function updateScheduleChoices () {
    await Promise.all(Array.from(document.querySelectorAll('select[data-divisor]')).map(async select => {
      const unit = select.closest('div').querySelector('output').dataset.unit
      await Promise.all(Array.from(select.options).map(async option => {
        option.textContent = select.id === 'longBreakEvery'
          ? await window.i18next.t('utils.minutes', {
            count: document.querySelector('#miniBreakEvery').value * (Number(option.value) + 1)
          })
          : await window.i18next.t(`utils.${unit}`, { count: Number(option.value) })
      }))
    }))
  }

  function realBreakInterval () {
    const microbreakInterval = document.querySelector('#miniBreakEvery').value * 1
    const breakInterval = document.querySelector('#longBreakEvery').value * 1
    return microbreakInterval * (breakInterval + 1)
  }
}
