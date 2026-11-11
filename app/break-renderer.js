import { breakActions } from './utils/breakActions.js'
import HtmlTranslate from './utils/htmlTranslate.js'
import { MINT_COLOR } from './utils/settingsTheme.js'
import applyBreakHealthEffect from './utils/breakHealthEffect.js'
import './platform.js'
import { showBreakProgress } from './utils/quietRestProgress.js'

window.onload = async (event) => {
  const [idea, started, duration, strictMode, postpone,
    postponePercent, danger, breakHealthMode, postponeTime] = await window.breaks.sendBreakData()

  new HtmlTranslate(document).translate()
  applyBreakHealthEffect(danger, breakHealthMode, MINT_COLOR)

  document.ondragover = event =>
    event.preventDefault()

  document.ondrop = event =>
    event.preventDefault()

  document.querySelector('#close').onclick = async event =>
    await window.breaks.finishBreak(manualAwaiting)

  document.querySelector('#postpone').onclick = async event =>
    await window.breaks.postponeBreak()

  document.querySelector('.break-idea').innerHTML = window.breaks.sanitizeIdea(idea[0])
  document.querySelector('.break-text').innerHTML = window.breaks.sanitizeIdea(idea[1])

  document.querySelectorAll('.break-idea a, .break-text a').forEach(a => {
    a.onclick = (event) => {
      event.preventDefault()
      window.electronApi.openExternal(a.href)
    }
  })

  document.querySelectorAll('.break-idea img, .break-text img').forEach(async img => {
    const src = img.getAttribute('src') || ''
    const resolved = await window.electronApi.resolveLocalImage(src)
    if (resolved) {
      img.src = resolved
    } else {
      img.remove()
    }
  })

  const progress = document.querySelector('#progress')
  const progressTime = document.querySelector('#progress-time')
  const postponeElement = document.querySelector('#postpone')
  const closeElement = document.querySelector('#close')
  const manualFinishElement = document.querySelector('#finish')
  const opacity = await window.settings.get('transparentMode') ? await window.settings.get('opacity') : 1
  document.body.style.setProperty('--rest-opacity', opacity)

  document.querySelectorAll('.tiptext').forEach(async tt => {
    const keyboardShortcut = await window.settings.get('endBreakShortcut')
    tt.innerHTML = window.utils.formatKeyboardShortcut(keyboardShortcut)
  })

  const restriction = document.querySelector('#break-restriction')
  const messages = Object.fromEntries(await Promise.all(['strict', 'postponeUnavailable'].map(async key => [
    key, await window.i18next.t(`prd11.${key}`)
  ])))
  if (postponeTime > 0) {
    const language = await window.settings.get('language')
    const unit = postponeTime < 60000 ? 'second' : 'minute'
    const time = new Intl.NumberFormat(language, { style: 'unit', unit, maximumFractionDigits: 1 })
      .format(postponeTime / (unit === 'minute' ? 60000 : 1000))
    postponeElement.querySelector('[data-i18next]').textContent = await window.i18next.t('prd11.postponeFor', { time })
  }
  postponeElement.classList.remove('hidden')
  closeElement.classList.remove('hidden')

  let manualAwaiting = false

  const locale = await window.settings.get('language')
  document.documentElement.lang = locale

  manualFinishElement.onclick = async () => {
    await window.breaks.finishBreak(manualAwaiting)
  }

  const updateProgress = async () => {
    if (await window.settings.get('currentTimeInBreaks')) {
      document.querySelector('.break-clock').innerHTML = (new Date()).toLocaleTimeString()
    }
    const now = Date.now()
    const passed = now - started
    if (!manualAwaiting) {
      if (passed < duration) {
        const passedPercent = passed / duration * 100
        const allowed = breakActions(strictMode, postpone, passedPercent, postponePercent)
        postponeElement.disabled = !allowed.postpone
        closeElement.disabled = !allowed.skip
        const reason = strictMode ? 'strict' : (!postpone ? 'postponeUnavailable' : null)
        restriction.textContent = reason ? messages[reason] : ''
        progress.value = (100 - passedPercent) * progress.max / 100
        showBreakProgress(progress, progressTime, duration - passed)
        progressTime.setAttribute('aria-label', await window.utils.formatTimeRemaining(duration - passed, locale))
      }
    } else {
      showBreakProgress(progress, progressTime, passed, true)
      progressTime.setAttribute('aria-label', await window.utils.formatElapsedDuration(passed, locale))
    }
  }
  await updateProgress()
  setInterval(updateProgress, 100)

  window.breaks.onEnterManualAwait(async (which) => {
    if (which !== 'break' || manualAwaiting) return
    manualAwaiting = true
    restriction.textContent = ''
    progress.value = 0
    progressTime.classList.remove('hidden')
    postponeElement.classList.add('hidden')
    closeElement.classList.add('hidden')
    manualFinishElement.classList.remove('hidden')
    showBreakProgress(progress, progressTime, Date.now() - started, true)
    progressTime.setAttribute('aria-label', await window.utils.formatElapsedDuration(Date.now() - started, locale))
  })

  await window.breaks.signalLoaded()
}
