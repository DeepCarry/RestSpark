import HtmlTranslate from './utils/htmlTranslate.js'

const element = id => document.getElementById(id)
const selected = () => document.querySelector('[name="preset"]:checked').value

async function showStep (preferences) {
  element('mode').hidden = preferences
  element('prefs').hidden = !preferences
  element(preferences ? 'mode-step' : 'prefs-step').removeAttribute('aria-current')
  element(preferences ? 'prefs-step' : 'mode-step').setAttribute('aria-current', 'step')
  if (preferences) element('chosen-preset').textContent = await window.i18next.t(`prd11.${selected()}Detail`)
  document.querySelector('section:not([hidden]) h1').focus()
}

async function save (preset) {
  const buttons = [...document.querySelectorAll('#prefs button')]
  buttons.forEach(button => { button.disabled = true })
  element('setup-error').hidden = true
  try {
    const saved = await window.onboarding.complete(preset, {
      openAtLogin: element('login').checked,
      monitorDnd: element('focus').checked,
      notify: element('notify').checked
    })
    if (saved) return
  } catch {
    // Show the same retry message for IPC and settings write failures.
  }
  element('setup-error').hidden = false
  buttons.forEach(button => { button.disabled = false })
}

window.addEventListener('DOMContentLoaded', async () => {
  document.documentElement.lang = await window.settings.get('language')
  if (await window.onboarding.isPreview()) {
    element('preview-note').hidden = false
    element('skip').hidden = true
    element('complete').dataset.i18next = 'prd11.finishPreview'
  }
  await new HtmlTranslate(document).translate()
  element('next').onclick = () => showStep(true)
  element('back').onclick = () => showStep(false)
  element('skip').onclick = () => save(null)
  element('complete').onclick = () => save(selected())
  document.querySelector('[name="preset"]:checked').focus()
})
