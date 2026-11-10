import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initScheduleEditors } from '../app/schedule-editors.js'
import { saveSchedulePatch } from '../app/utils/scheduleControls.js'

describe('schedule numeric editors', () => {
  let dom, ui, saved, store
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
  const input = id => document.getElementById(id)
  const edit = (id, value) => { input(id).value = value; input(id).dispatchEvent(new window.Event('input', { bubbles: true })) }
  const apply = async id => { document.querySelector(`[data-editor-for=${id}] [data-apply]`).click(); await flush() }
  beforeEach(async () => {
    dom = new JSDOM(readFileSync(new URL('../app/preferences.html', import.meta.url), 'utf8'), { pretendToBeVisual: true })
    global.window = dom.window; global.document = dom.window.document
    saved = { microbreakInterval: 1200000, microbreakDuration: 25000, longBreakInterval: 3600000, breakDuration: 300000 }
    store = { get store () { return saved }, set: patch => { saved = { ...saved, ...patch } } }
    window.i18next = { t: async (key, args) => `${key} ${JSON.stringify(args || {})}` }
    window.settings = { saveSchedule: vi.fn(async patch => saveSchedulePatch(store, patch)) }
    document.querySelectorAll('.schedule-input-shell').forEach(shell => { shell.getBoundingClientRect = () => ({ left: 300, right: 530, top: 100, bottom: 140, width: 230, height: 40 }) })
    ui = await initScheduleEditors(document, saved)
  })
  afterEach(() => { ui?.destroy(); dom.window.close(); delete global.window; delete global.document })
  it('preserves legacy 25 seconds and exposes four labeled numeric inputs with units', () => {
    expect(input('miniBreakFor').tagName).toBe('INPUT')
    expect(input('miniBreakFor').type).toBe('number')
    expect(input('miniBreakFor').value).toBe('25')
    expect(document.querySelector('[data-editor-for=miniBreakFor] [data-legacy]').hidden).toBe(false)
    expect(input('longBreakEvery').value).toBe('60')
    expect(document.querySelectorAll('.schedule input[type=number]')).toHaveLength(4)
  })
  it('does not persist empty, invalid, off-step or out-of-range input', async () => {
    for (const value of ['', '-1', '35', '301', '80.5']) {
      edit('miniBreakFor', value); await apply('miniBreakFor')
      expect(saved.microbreakDuration).toBe(25000)
      expect(input('miniBreakFor').getAttribute('aria-invalid')).toBe('true')
    }
    expect(window.settings.saveSchedule).not.toHaveBeenCalled()
  })
  it('saves a custom value once on explicit apply and can cancel an empty draft', async () => {
    edit('miniBreakFor', '70')
    expect(saved.microbreakDuration).toBe(25000)
    await apply('miniBreakFor')
    expect(saved.microbreakDuration).toBe(70000)
    expect(window.settings.saveSchedule).toHaveBeenCalledTimes(1)
    edit('miniBreakFor', '')
    document.querySelector('[data-editor-for=miniBreakFor] [data-cancel]').click()
    expect(input('miniBreakFor').value).toBe('70')
  })
  it('opens at most eight presets, selects one and closes with Escape', async () => {
    document.querySelector('[data-editor-for=miniBreakFor] [data-presets]').click(); await flush()
    const popover = document.querySelector('.schedule-popover')
    expect(popover.hidden).toBe(false)
    expect(popover.querySelectorAll('[data-preset-value]')).toHaveLength(8)
    popover.querySelector('[data-preset-value="90"]').click(); await flush()
    expect(saved.microbreakDuration).toBe(90000)
    expect(popover.hidden).toBe(true)
    edit('miniBreakFor', '')
    input('miniBreakFor').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(input('miniBreakFor').value).toBe('90')
  })
  it('edits mini and long intervals independently without a linked confirmation', async () => {
    edit('miniBreakEvery', '45'); await apply('miniBreakEvery')
    expect(saved.microbreakInterval).toBe(2700000)
    expect(saved.longBreakInterval).toBe(3600000)
    edit('longBreakEvery', '60'); await apply('longBreakEvery')
    expect(saved.longBreakInterval).toBe(3600000)
    expect(saved.microbreakInterval).toBe(2700000)
    expect(document.querySelector('[data-linked-apply]')).toBeNull()
  })
  it('offers all six long interval presets even with a60-minute mini interval', async () => {
    saved.microbreakInterval = 3600000; await ui.refresh(saved)
    document.querySelector('[data-editor-for=longBreakEvery] [data-presets]').click(); await flush()
    expect([...document.querySelectorAll('[data-preset-value]')].map(b => b.dataset.presetValue)).toEqual(['30', '45', '60', '90', '120', '180'])
    document.querySelector('[data-preset-value="180"]').click(); await flush()
    expect(saved.longBreakInterval).toBe(10800000)
  })
  it('retains old values on save failure and allows retry', async () => {
    window.settings.saveSchedule.mockRejectedValueOnce(new Error('IPC failed'))
    edit('miniBreakFor', '60'); await apply('miniBreakFor')
    expect(saved.microbreakDuration).toBe(25000)
    expect(input('miniBreakFor').getAttribute('aria-invalid')).toBe('true')
    await apply('miniBreakFor'); expect(saved.microbreakDuration).toBe(60000)
  })
  it('does not multiply saves on double submit while IPC is pending', async () => {
    let finish
    window.settings.saveSchedule.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    edit('miniBreakFor', '60'); await apply('miniBreakFor'); await apply('miniBreakFor')
    expect(window.settings.saveSchedule).toHaveBeenCalledTimes(1)
    finish(saveSchedulePatch(store, { microbreakDuration: 60000 })); await flush()
    expect(input('miniBreakFor').value).toBe('60')
  })
  it('includes the panel border when placing presets above the input', async () => {
    const shell = document.querySelector('[data-editor-for=miniBreakFor] .schedule-input-shell')
    shell.getBoundingClientRect = () => ({ left: 300, right: 530, top: 600, bottom: 640, width: 230, height: 40 })
    const panel = document.querySelector('.schedule-popover')
    Object.defineProperty(panel, 'scrollHeight', { value: 158 })
    panel.getBoundingClientRect = () => ({ height: 160, width: 230, top: Number.parseFloat(panel.style.top) || 0 })
    document.querySelector('[data-editor-for=miniBreakFor] [data-presets]').click()
    await flush()
    expect(panel.dataset.placement).toBe('above')
    expect(600 - (Number.parseFloat(panel.style.top) + 160)).toBe(8)
  })
  it('does not revive a cancelled error after delayed translation', async () => {
    let finish
    const translate = window.i18next.t
    window.i18next.t = (key, args) => key.endsWith('invalid_microbreakDuration') ? new Promise(resolve => { finish = resolve }) : translate(key, args)
    edit('miniBreakFor', '35')
    document.querySelector('[data-editor-for=miniBreakFor] [data-apply]').click()
    document.querySelector('[data-editor-for=miniBreakFor] [data-cancel]').click()
    finish('invalid seconds'); await flush()
    expect(input('miniBreakFor').value).toBe('25')
    expect(input('miniBreakFor').getAttribute('aria-invalid')).toBe('false')
    expect(document.querySelector('#miniBreakFor-error').textContent).toBe('')
  })
  it('does not revive cancelled long-interval validation after translation', async () => {
    let finish
    const translate = window.i18next.t
    window.i18next.t = (key, args) => key.endsWith('invalid_longBreakInterval') ? new Promise(resolve => { finish = resolve }) : translate(key, args)
    edit('longBreakEvery', '181')
    document.querySelector('[data-editor-for=longBreakEvery] [data-apply]').click()
    document.querySelector('[data-editor-for=longBreakEvery] [data-cancel]').click()
    finish('invalid interval'); await flush()
    expect(document.querySelector('#longBreakEvery-error').textContent).toBe('')
    expect(saved.longBreakInterval).toBe(3600000)
  })
  it('marks an out-of-range legacy long interval without changing it', async () => {
    saved.microbreakInterval = 3600000
    saved.longBreakInterval = 55800000
    await ui.refresh(saved)
    expect(document.querySelector('[data-editor-for=longBreakEvery] [data-legacy]').hidden).toBe(false)
    expect(input('longBreakEvery').value).toBe('930')
    expect(saved.longBreakInterval).toBe(55800000)
  })
})
