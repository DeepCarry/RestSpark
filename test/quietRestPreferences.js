import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { vi, expect } from 'vitest'
import { saveSchedulePatch } from '../app/utils/scheduleControls.js'
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
    window.settings.saveSchedule = async patch => saveSchedulePatch({ get store () { return saved }, set: patch => { saved = { ...saved, ...patch } } }, patch)
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
  it('opens the plan, hides the retired support entry and keeps settings reachable', () => {
    expect(document.querySelector('.schedule').classList.contains('hidden')).toBe(false)
    expect(window.getComputedStyle(document.querySelector('[data-section=heart]')).display).toBe('none')
    for (const section of ['settings', 'theme', 'about', 'schedule']) {
      const link = document.querySelector(`[data-section=${section}]`)
      link.click()
      expect(link.getAttribute('aria-current')).toBe('page')
      expect(document.querySelector(`body > .${section}`).classList.contains('hidden')).toBe(false)
      expect(document.querySelectorAll('.navigation [aria-current=page]')).toHaveLength(1)
    }
  })
  it('preserves an existing duration outside the master example and converts units on save', async () => {
    const duration = document.querySelector('#miniBreakFor')
    expect(duration.tagName).toBe('INPUT')
    expect(duration.value).toBe('80')
    duration.value = '90'
    duration.dispatchEvent(new window.Event('input')); duration.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.advanceTimersByTimeAsync(0)
    expect(saved.microbreakDuration).toBe(90000)
    const interval = document.querySelector('#miniBreakEvery')
    interval.value = '20'
    interval.dispatchEvent(new window.Event('input')); interval.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.advanceTimersByTimeAsync(0)
    expect(saved.microbreakInterval).toBe(1200000)
    expect(document.querySelector('#longBreakEvery-value').textContent).toContain('80')
    expect(saved.breakInterval).toBe(3)
    expect(document.querySelector('#longBreakEvery').value).toBe('4')
  })
  it('represents advanced saved values without silently clearing them', async () => {
    saved.microbreakDuration = 25000
    await translate()
    await vi.advanceTimersByTimeAsync(0)
    expect(document.querySelector('#miniBreakFor').value).toBe('25')
    expect(saved.microbreakDuration).toBe(25000)
  })
  it('binds sound previews and controls even when IPC takes more than 500 ms', async () => {
    document.querySelectorAll('[data-preview-sound]').forEach(image => { image.onclick = null })
    window.i18next.t = (key, options) => new Promise(resolve => setTimeout(() => resolve(`${key} ${options?.count ?? ''}`), 600))
    window.stretchly.playSound = vi.fn()
    const loaded = window.onload({})
    await vi.advanceTimersByTimeAsync(2500)
    await loaded
    expect(typeof document.querySelector('[data-preview-sound]').onclick).toBe('function')
    const duration = document.querySelector('#miniBreakFor')
    duration.value = '60'
    duration.dispatchEvent(new window.Event('input'))
    duration.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.advanceTimersByTimeAsync(2500)
    expect(saved.microbreakDuration).toBe(60000)
    document.querySelector('[data-preview-sound]').click()
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
    for (const range of document.querySelectorAll('.schedule input[type=number]')) {
      expect(document.querySelector(`label[for=${range.id}]`)).not.toBeNull()
      expect(document.querySelector(`output[for=${range.id}]`)).not.toBeNull()
    }
  })
  it('exposes one real theme and accessible sound preview controls', () => {
    expect(document.querySelectorAll('[name=mainColor]')).toHaveLength(0)
    expect(document.querySelector('.theme-preview img').getAttribute('src')).toBe('images/quiet-rest/stretch.png')
    expect(document.querySelectorAll('button[data-preview-sound]')).toHaveLength(4)
  })
  it('opens nested project link content using the anchor URL', () => {
    window.electronApi = { openExternal: vi.fn() }
    document.querySelector('a[href="https://github.com/DeepCarry/RestSpark"] strong').click()
    expect(window.electronApi.openExternal).toHaveBeenCalledWith('https://github.com/DeepCarry/RestSpark')
  })
  it('shows a safe missing-release state rather than N/A or throwing', async () => {
    saved.disableAppUpdateFeatures = false
    const checker = (await import('../app/utils/versionChecker.js')).default
    vi.spyOn(checker.prototype, 'latest').mockResolvedValue(undefined)
    await window.onload({})
    await vi.advanceTimersByTimeAsync(0)
    expect(document.querySelector('.update-status').textContent).toContain('settingsV1.noRelease')
    expect(document.querySelector('.version').textContent).toBe('1.20.0')
    vi.restoreAllMocks()
  })
  it('has a complete distributable upstream license in the disclosure', () => {
    const license = document.querySelector('#licenses').textContent
    expect(license).toContain('Copyright (c) 2016-, Jan Hovancik')
    expect(license).toContain('THIS SOFTWARE IS PROVIDED')
    expect(license).toContain('Colin Shanley')
  })
  it('initializes appearance and saves changes while update lookup is pending', async () => {
    saved.disableAppUpdateFeatures = false
    saved.themeSource = 'dark'
    const control = document.querySelector('#themeSource')
    control.value = 'system'
    control.onchange = null
    const checker = (await import('../app/utils/versionChecker.js')).default
    let finish
    vi.spyOn(checker.prototype, 'latest').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const loaded = window.onload({})
    await vi.advanceTimersByTimeAsync(0)
    try {
      expect(control.value).toBe('dark')
      control.value = 'light'
      control.dispatchEvent(new window.Event('change'))
      expect(saved.themeSource).toBe('light')
    } finally {
      finish(undefined)
      await loaded
      vi.restoreAllMocks()
    }
  })
  it('shows exact saved seconds instead of rounded fractional minutes', async () => {
    const { formatUnitAndValue } = await import('../app/utils/utils.js')
    window.utils.formatUnitAndValue = (unit, value) => formatUnitAndValue(unit, value, window.i18next)
    saved.microbreakDuration = 80500
    saved.microbreakInterval = 915000
    saved.breakInterval = 2
    await translate()
    await vi.advanceTimersByTimeAsync(0)
    expect(document.querySelector('#miniBreakFor').value).toBe('80.5')
    expect(document.querySelector('#miniBreakFor-value').textContent).toContain('80.5')
    expect(saved.microbreakDuration).toBe(80500)
    expect(document.querySelector('#longBreakEvery-value').textContent).toContain('45.75')
  })
})
