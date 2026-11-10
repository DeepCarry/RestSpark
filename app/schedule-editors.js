import { SCHEDULE_FIELDS, displayScheduleValue, storedScheduleValue, validScheduleValue, validateSchedulePatch } from './utils/scheduleControls.js'

export async function initScheduleEditors (document, initialSettings) {
  const win = document.defaultView
  const abort = new win.AbortController()
  const listen = (target, event, callback, options = {}) => target.addEventListener(event, callback, { ...options, signal: abort.signal })
  const t = (key, args) => win.i18next.t(`scheduleV2.${key}`, args)
  let current = { ...initialSettings }
  let active = null
  let busy = false
  let panelOwner = null
  let generation = 0
  const panel = document.createElement('section')
  panel.className = 'schedule-popover'
  panel.id = 'schedule-presets-panel'
  panel.setAttribute('popover', 'manual')
  panel.setAttribute('role', 'dialog')
  panel.hidden = true
  document.body.appendChild(panel)
  const editors = Object.entries(SCHEDULE_FIELDS).map(([key, field]) => {
    const root = document.querySelector(`[data-editor-for=${field.id}]`)
    return { key, field, root, revision: 0, input: root.querySelector('input'), trigger: root.querySelector('[data-presets]'), error: root.querySelector('.schedule-editor-error'), actions: root.querySelector('.schedule-editor-actions') }
  })
  function closePanel (focus = false) {
    const owner = panelOwner
    if (!panel.hidden && panel.hidePopover) panel.hidePopover()
    panel.hidden = true
    if (owner) owner.trigger.setAttribute('aria-expanded', 'false')
    panelOwner = null
    if (focus) owner?.trigger.focus()
  }
  function cancel (editor) {
    if (busy || !editor) return
    ++editor.revision
    editor.input.value = String(displayScheduleValue(editor.key, current[editor.key]))
    editor.input.setAttribute('aria-invalid', 'false')
    editor.error.textContent = ''
    editor.actions.hidden = true
    if (active === editor) active = null
  }
  function begin (editor) {
    if (active && active !== editor) cancel(active)
    active = editor
    ++editor.revision
    editor.actions.hidden = false
    editor.error.textContent = ''
    editor.input.setAttribute('aria-invalid', 'false')
  }
  async function refresh (settings = current) {
    const revision = ++generation
    closePanel()
    current = { ...settings }
    active = null
    editors.forEach(cancel)
    const labels = await Promise.all(editors.map(async editor => {
      const [legacy, output, increase, decrease] = await Promise.all([
        t('legacy'),
        win.i18next.t(`utils.${editor.field.unit}`, { count: displayScheduleValue(editor.key, current[editor.key]) }),
        t('increaseLabel'), t('decreaseLabel')
      ])
      return { editor, legacy, output, increase, decrease }
    }))
    if (revision !== generation) return
    for (const { editor, legacy, output, increase, decrease } of labels) {
      const hint = editor.root.querySelector('[data-legacy]')
      hint.hidden = validScheduleValue(editor.key, current[editor.key])
      hint.textContent = legacy
      editor.root.querySelector('[data-adjust="1"]').setAttribute('aria-label', increase)
      editor.root.querySelector('[data-adjust="-1"]').setAttribute('aria-label', decrease)
      document.getElementById(`${editor.field.id}-value`).textContent = output
    }
  }

  async function showError (editor, result) {
    const revision = editor.revision
    editor.input.setAttribute('aria-invalid', 'true')
    const message = await t(result.error === 'saveFailed' ? 'saveFailed' : `invalid_${editor.key}`)
    if (editor.revision !== revision) return
    editor.error.textContent = message
  }
  async function apply (editor) {
    if (busy) return
    const raw = editor.input.value.trim()
    const unchanged = raw === String(displayScheduleValue(editor.key, current[editor.key]))
    const patch = { [editor.key]: storedScheduleValue(editor.key, raw) }
    const result = !unchanged && !/^\d+$/.test(raw) ? { ok: false, error: editor.key } : validateSchedulePatch(current, patch)
    if (!result.ok) { await showError(editor, result); return }
    if (unchanged) { cancel(editor); return }
    busy = true
    closePanel()
    editors.forEach(item => item.root.querySelectorAll('input, button').forEach(control => { control.disabled = true }))
    let response
    try { response = await win.settings.saveSchedule(patch) } catch { response = { ok: false, error: 'saveFailed' } }
    busy = false
    editors.forEach(item => item.root.querySelectorAll('input, button').forEach(control => { control.disabled = false }))
    if (response?.ok) {
      await refresh(response.settings)
    } else {
      await showError(editor, response || { error: 'saveFailed' })
    }
  }
  function positionPanel () {
    if (!panelOwner || panel.hidden) return
    const rect = panelOwner.root.querySelector('.schedule-input-shell').getBoundingClientRect()
    if (rect.bottom < 8 || rect.top > win.innerHeight - 8) { closePanel(); return }
    const width = Math.min(rect.width, win.innerWidth - 16)
    panel.style.width = `${width}px`
    panel.style.maxHeight = '280px'
    const height = Math.min(panel.getBoundingClientRect().height, 280)
    const below = win.innerHeight - rect.bottom - 16
    const above = rect.top - 16
    const openAbove = below < height && above > below
    const available = Math.max(48, openAbove ? above : below)
    panel.style.maxHeight = `${Math.min(280, available)}px`
    panel.style.left = `${Math.max(8, Math.min(rect.left, win.innerWidth - width - 8))}px`
    panel.style.top = `${openAbove ? Math.max(8, rect.top - Math.min(height, available) - 8) : rect.bottom + 8}px`
    panel.dataset.placement = openAbove ? 'above' : 'below'
  }
  async function openPanel (editor) {
    if (busy) return
    if (panelOwner === editor && !panel.hidden) { closePanel(true); return }
    if (active && active !== editor) cancel(active)
    closePanel()
    const revision = ++generation
    panelOwner = editor
    panel.replaceChildren()
    panel.setAttribute('aria-label', await t('presets'))
    if (revision !== generation || panelOwner !== editor) return
    const grid = document.createElement('div')
    grid.className = 'schedule-preset-grid'
    for (const value of editor.field.presets) {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.presetValue = String(value)
      const unit = editor.field.unit === 'seconds' && value % 60 === 0 ? 'Minutes' : editor.field.unit[0].toUpperCase() + editor.field.unit.slice(1)
      button.textContent = await t(`preset${unit}`, { count: unit === 'Minutes' && editor.field.unit === 'seconds' ? value / 60 : value })
      button.setAttribute('aria-pressed', String(value === displayScheduleValue(editor.key, current[editor.key])))
      button.onclick = () => { begin(editor); editor.input.value = String(value); apply(editor).then(() => editor.input.focus()) }
      grid.appendChild(button)
    }
    if (revision !== generation || panelOwner !== editor) return
    panel.appendChild(grid)
    const custom = document.createElement('button')
    custom.type = 'button'
    custom.className = 'schedule-custom'
    custom.textContent = await t('custom')
    custom.onclick = () => { closePanel(); begin(editor); editor.input.focus(); editor.input.select() }
    if (revision !== generation || panelOwner !== editor) return
    panel.appendChild(custom)
    panel.hidden = false
    panel.showPopover?.()
    editor.trigger.setAttribute('aria-expanded', 'true')
    positionPanel()
    panel.querySelector('button')?.focus()
  }
  for (const editor of editors) {
    listen(editor.input, 'input', () => begin(editor))
    listen(editor.input, 'keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); apply(editor) }
    })
    listen(editor.root.querySelector('[data-apply]'), 'click', () => apply(editor))
    listen(editor.root.querySelector('[data-cancel]'), 'click', () => { cancel(editor); editor.input.focus() })
    listen(editor.trigger, 'click', () => openPanel(editor))
    listen(editor.trigger, 'keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); openPanel(editor) } })
    editor.root.querySelectorAll('[data-adjust]').forEach(button => listen(button, 'click', () => {
      begin(editor)
      const { min, max, step } = editor.field
      const direction = Number(button.dataset.adjust)
      const old = Number(editor.input.value || displayScheduleValue(editor.key, current[editor.key]))
      const index = direction > 0 ? Math.floor((old - min) / step) + 1 : Math.ceil((old - min) / step) - 1
      editor.input.value = String(Math.max(min, Math.min(max, min + index * step)))
      editor.input.focus()
    }))
  }
  listen(document, 'click', event => {
    if (panelOwner?.root.contains(event.target) || panel.contains(event.target)) return
    closePanel()
    if (active && !active.root.contains(event.target)) cancel(active)
  })
  listen(document, 'keydown', event => {
    if (event.key !== 'Escape') return
    if (panelOwner || active) { event.preventDefault(); closePanel(true); cancel(active) }
  })
  listen(win, 'resize', positionPanel)
  listen(document, 'scroll', positionPanel, { capture: true })
  await refresh(initialSettings)
  return { refresh, close: () => { closePanel(); cancel(active) }, destroy: () => { ++generation; editors.forEach(editor => { ++editor.revision }); abort.abort(); panel.remove() } }
}
