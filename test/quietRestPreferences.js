import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { vi, expect } from 'vitest'
import defaults from '../app/utils/defaultSettings.js'

describe('Quiet Rest preferences', () => {
  let dom, saved, translate
  beforeEach(async () => {
    vi.useFakeTimers()
    dom = new JSDOM(readFileSync(new URL('../app/preferences.html', import.meta.url), 'utf8'))
    global.window = dom.window
    global.document = dom.window.document
    Object.defineProperties(window.screen, { availWidth: { value: 1440 }, availHeight: { value: 900 } })
    window.matchMedia = () => ({ matches: false, addEventListener: () => {} })
    window.scrollTo = vi.fn()
    window.runtime = { platform: () => 'darwin', windowsStore: () => false, windowsPortable: () => false }
    saved = { ...defaults, language: 'en', disableAppUpdateFeatures: true, microbreakDuration: 80000, microbreakInterval: 900000, breakInterval: 3 }
    window.settings = { get: async key => saved[key], currentSettings: async () => saved, saveSettings: vi.fn((key, value) => { saved[key] = value }) }
    window.i18next = { t: async (key, options) => `${key} ${options?.count ?? ''}`, dir: async () => 'ltr' }
    window.utils = { formatUnitAndValue: async (unit, value) => `${value} ${unit}` }
    window.global = { getValue: async () => false }
    window.stretchly = {
      getWindowBounds: async () => ({ width: 860, height: 740 }),
      setWindowSize: vi.fn(),
      onTranslate: callback => { translate = callback },
      onEnableContributorPreferences: () => {},
      getVersion: async () => '1.20.0'
    }
    vi.resetModules()
    await import('../app/preferences-renderer.js')
    await window.onload({})
    await vi.advanceTimersByTimeAsync(0)
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    dom.window.close()
    delete global.window
    delete global.document
  })
  it('opens the plan and keeps every original section reachable', () => {
    expect(document.querySelector('.schedule').classList.contains('hidden')).toBe(false)
    for (const section of ['settings', 'theme', 'about', 'heart', 'schedule']) {
      const link = document.querySelector(`[data-section=${section}]`)
      link.click()
      expect(link.getAttribute('aria-current')).toBe('page')
      expect(document.querySelector(`body > .${section}`).classList.contains('hidden')).toBe(false)
      expect(document.querySelectorAll('.navigation [aria-current=page]')).toHaveLength(1)
    }
  })
  it('preserves an existing duration outside the master example and converts units on save', async () => {
    const duration = document.querySelector('#miniBreakFor')
    expect(duration.tagName).toBe('SELECT')
    expect(duration.value).toBe('80')
    duration.value = '90'
    duration.dispatchEvent(new window.Event('change'))
    await vi.advanceTimersByTimeAsync(0)
    expect(saved.microbreakDuration).toBe(90000)
    const interval = document.querySelector('#miniBreakEvery')
    interval.value = '20'
    interval.dispatchEvent(new window.Event('change'))
    await vi.advanceTimersByTimeAsync(0)
    expect(saved.microbreakInterval).toBe(1200000)
    expect(document.querySelector('#longBreakEvery-value').textContent).toContain('80')
    expect(saved.breakInterval).toBe(3)
    expect(document.querySelector('#longBreakEvery').selectedOptions[0].textContent).toContain('80')
  })
  it('represents advanced saved values without silently clearing them', async () => {
    saved.microbreakDuration = 25000
    await translate()
    await vi.advanceTimersByTimeAsync(0)
    expect(document.querySelector('#miniBreakFor').value).toBe('25')
    expect(saved.microbreakDuration).toBe(25000)
  })
  it('binds sound previews and controls even when IPC takes more than 500 ms', async () => {
    document.querySelectorAll('.sounds img').forEach(image => { image.onclick = null })
    document.querySelector('#miniBreakFor').onchange = null
    window.utils.formatUnitAndValue = (unit, value) => new Promise(resolve => setTimeout(() => resolve(`${value} ${unit}`), 600))
    window.stretchly.playSound = vi.fn()
    const loaded = window.onload({})
    await vi.advanceTimersByTimeAsync(2500)
    await loaded
    expect(typeof document.querySelector('.sounds img').onclick).toBe('function')
    expect(typeof document.querySelector('#miniBreakFor').onchange).toBe('function')
    document.querySelector('.sounds img').click()
    expect(window.stretchly.playSound).toHaveBeenCalledOnce()
  })
  it('does not reset the user window size when navigating', () => {
    window.stretchly.setWindowSize.mockClear()
    document.querySelector('[data-section=theme]').click()
    expect(window.stretchly.setWindowSize).not.toHaveBeenCalled()
  })
  it('preserves negative settings semantics and independent strict modes', () => {
    document.querySelector('#monitorDnd').click()
    expect(saved.monitorDnd).toBe(false)
    document.querySelector('#enableStrictMini').click()
    expect(saved.microbreakStrictMode).toBe(true)
    expect(saved.breakStrictMode).toBe(false)
  })
  it('does not permit disabling both break types', async () => {
    window.alert = vi.fn()
    document.querySelector('#enableMiniBreaks').click()
    document.querySelector('#enableLongBreaks').click()
    await vi.advanceTimersByTimeAsync(0)
    expect(saved.microbreak).toBe(false)
    expect(saved.break).toBe(true)
    expect(window.alert).toHaveBeenCalledOnce()
  })
  it('updates translated units without resetting values and associates range outputs', async () => {
    await translate()
    await vi.advanceTimersByTimeAsync(0)
    expect(document.querySelector('#miniBreakFor').value).toBe('80')
    for (const range of document.querySelectorAll('.schedule [data-divisor]')) {
      expect(document.querySelector(`label[for=${range.id}]`)).not.toBeNull()
      expect(document.querySelector(`output[for=${range.id}]`)).not.toBeNull()
    }
  })
})
