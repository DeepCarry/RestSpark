import HtmlTranslate from './utils/htmlTranslate.js'

const el = id => document.getElementById(id)
const t = (key, options) => window.i18next.t(`prd11.${key}`, options)
const setText = (id, value) => {
  if (el(id).textContent !== value) el(id).textContent = value
}
const timerText = (milliseconds, hours = false) => {
  const total = Math.max(0, Math.ceil(milliseconds / 1000))
  const pad = value => String(value).padStart(2, '0')
  const seconds = pad(total % 60)
  const minutes = pad(hours ? Math.floor(total / 60) % 60 : Math.floor(total / 60))
  return hours ? `${pad(Math.floor(total / 3600))}:${minutes}:${seconds}` : `${minutes}:${seconds}`
}

let locale
let snapshot
let interval
let refreshing = false
let visible = false
let labels
const labelKeys = ['running', 'paused', 'focusActive', 'focusUnavailable', 'idle', 'power', 'exclusion', 'noBreak', 'onBreak',
  'focusResumes', 'pauseResets', 'shortNext', 'longNext', 'shortLabel', 'longLabel', 'off', 'eyes', 'balanced', 'deep', 'custom', 'restShortNow', 'restLongNow', 'pause', 'resumeEarly', 'changeTime',
  'pickDeadline', 'morning', 'oneHour', 'twoHours', 'for3Hours', 'fiveHours']

function formatDate (date) {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

async function render (state) {
  if (state.language !== locale) {
    locale = state.language
    document.documentElement.lang = locale
    await new HtmlTranslate(document).translate()
    labels = Object.fromEntries(await Promise.all(labelKeys.map(async key => [key, await t(key)])))
  }
  const showingOptions = state.view === 'options'
  el('overview').hidden = showingOptions
  el('options').hidden = !showingOptions
  if (showingOptions) {
    if (snapshot?.view !== 'options') {
      const keys = { '1h': 'oneHour', '2h': 'twoHours', '3h': 'for3Hours', '5h': 'fiveHours', morning: 'morning' }
      el('choices').replaceChildren(...state.choices.map(choice => {
        const button = document.createElement('button')
        const title = document.createElement('strong')
        title.textContent = labels[keys[choice.id]]
        const time = document.createElement('span')
        button.append(title, time)
        button.onclick = () => act('select', choice.id)
        return button
      }))
      el('choices').firstElementChild?.focus()
    }
    el('choices').querySelectorAll('button span').forEach((time, index) => {
      const formatted = formatDate(state.choices[index].until)
      if (time.textContent !== formatted) time.textContent = formatted
    })
    return
  }

  const running = state.view === 'running' && state.nextAt !== null
  const paused = state.view === 'paused'
  const blockers = state.blockers.map(reason => labels[reason]).join(' · ')
  const status = paused ? labels.paused : (blockers || (state.active ? labels.onBreak : running ? labels.running : labels.noBreak))
  setText('status', status)
  el('status-card').dataset.view = state.view
  el('countdown').hidden = !running && !(paused && state.pauseUntil)
  setText('countdown', timerText((paused ? state.pauseUntil : state.nextAt) - Date.now(), paused))
  el('progress').hidden = !running
  el('progress').value = state.progress
  const detail = paused
    ? [state.pauseUntil && await t('resumesAt', { time: formatDate(state.pauseUntil) }), blockers].filter(Boolean).join(' · ')
    : (state.blockers.includes('focusActive') ? labels.focusResumes : '')
  setText('detail', detail)
  el('resume-rule').hidden = !paused
  el('next-card').hidden = !running
  if (running) {
    setText('next-type', labels[state.type === 'break' ? 'longNext' : 'shortNext'])
    const length = new Intl.NumberFormat(locale, { style: 'unit', unit: state.duration < 60000 ? 'second' : 'minute' })
    const duration = length.format(state.duration / (state.duration < 60000 ? 1000 : 60000))
    setText('next-detail', `${formatDate(state.nextAt)} · ${duration}`)
  }
  el('focus-unavailable').hidden = state.focus !== 'unknown'
  el('pause').hidden = paused
  el('pause').disabled = state.locked
  el('resume').hidden = !paused
  el('change').hidden = !paused
  el('rest').hidden = paused
  el('rest').disabled = !state.canRest
  setText('rest', labels[state.cadence[0].enabled ? 'restShortNow' : 'restLongNow'])
  const minutes = new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'narrow' })
  const seconds = new Intl.NumberFormat(locale, { style: 'unit', unit: 'second', unitDisplay: 'narrow' })
  const cadence = state.cadence.map((plan, index) => {
    const name = labels[index === 0 ? 'shortLabel' : 'longLabel']
    const duration = plan.duration < 60000 ? seconds.format(plan.duration / 1000) : minutes.format(plan.duration / 60000)
    return plan.enabled ? `${name} ${minutes.format(plan.interval / 60000)} / ${duration}` : `${name} ${labels.off}`
  })
  setText('summary', [labels[state.preset], ...cadence].join(' · '))
  if (snapshot?.view === 'options') el(paused ? 'resume' : 'pause').focus()
}

async function refresh () {
  if (!visible || refreshing) return
  refreshing = true
  try {
    const state = await window.popover.read()
    if (state && visible) {
      await render(state)
      snapshot = state
      document.querySelector('.popover-surface').classList.add('loaded')
    }
  } finally {
    refreshing = false
  }
}

async function act (type, choice) {
  await window.popover.action(type, choice)
  await refresh()
}

for (const [id, action] of [['pause', 'options'], ['change', 'options'], ['cancel', 'back'], ['resume', 'resume'], ['rest', 'rest'], ['settings', 'settings']]) {
  el(id).onclick = () => act(action)
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') act(snapshot?.view === 'options' ? 'back' : 'dismiss')
})
window.popover.onVisibility(show => {
  visible = show
  clearInterval(interval)
  if (show) {
    snapshot = null
    document.querySelector('.popover-surface').classList.remove('loaded')
    refresh()
    interval = setInterval(refresh, 1000)
  }
})
