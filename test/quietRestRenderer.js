import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { vi, expect } from 'vitest'
import { canPostpone, canSkip } from '../app/utils/utils.js'

for (const [file, which, idea] of [
  ['microbreak', 'microbreak', 'Rest your eyes'],
  ['break', 'break', ['Stretch', 'Relax your shoulders']]
]) {
  describe(`Quiet Rest ${file} renderer`, () => {
    let dom, manual, finish, postpone
    async function load (strict = false, allowed = true, duration = 20000) {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-11-09T00:00:00Z'))
      dom = new JSDOM(readFileSync(new URL(`../app/${file}.html`, import.meta.url), 'utf8'))
      global.window = dom.window
      global.document = dom.window.document
      finish = vi.fn()
      postpone = vi.fn()
      window.runtime = { platform: () => 'darwin', windowsStore: () => false, windowsPortable: () => false }
      window.settings = { get: async key => ({ mainColor: '#478484', language: 'en', endBreakShortcut: 'CmdOrCtrl+X' })[key] }
      window.i18next = { t: async key => key, dir: async () => 'ltr' }
      window.utils = { canPostpone, canSkip, formatKeyboardShortcut: x => x, formatTimeRemaining: async x => `${x} remaining`, formatElapsedDuration: async x => `${x} elapsed` }
      window.breaks = {
        sendBreakData: async () => [file === 'microbreak' ? [idea] : idea, Date.now(), duration, strict, allowed, 30, 0, false],
        finishBreak: finish,
        postponeBreak: postpone,
        sanitizeIdea: x => typeof x === 'string' ? x : '',
        signalLoaded: vi.fn(),
        onEnterManualAwait: callback => { manual = callback }
      }
      vi.resetModules()
      await import(`../app/${file}-renderer.js`)
      await window.onload({})
    }
    afterEach(() => {
      vi.clearAllTimers()
      vi.useRealTimers()
      dom?.window.close()
      delete global.window
      delete global.document
    })
    it('loads both approved portraits for live CSS appearance changes', () => {
      const markup = readFileSync(new URL(`../app/${file}.html`, import.meta.url), 'utf8')
      const { document } = new JSDOM(markup).window
      expect(document.querySelector('.rest-illustration-night').getAttribute('src')).toBe('images/quiet-rest/stretch-night.png')
      expect(document.querySelector('.rest-illustration-day').getAttribute('src')).toBe('images/quiet-rest/stretch.png')
    })
    it('shows the configured duration immediately and updates clock and ring', async () => {
      await load()
      expect(document.querySelector('#progress-time').textContent).toBe('00:20')
      expect(document.querySelector('#progress').value).toBe(10000)
      await vi.advanceTimersByTimeAsync(10000)
      expect(document.querySelector('#progress-time').textContent).toBe('00:10')
      expect(document.querySelector('.timer-remaining').getAttribute('stroke-dashoffset')).toBe('50')
      expect(document.querySelector('#progress-time').getAttribute('aria-label')).toContain('remaining')
    })
    it('preserves the postpone deadline and then enables skipping', async () => {
      await load()
      await vi.advanceTimersByTimeAsync(100)
      expect(document.querySelector('#postpone').classList.contains('hidden')).toBe(false)
      expect(document.querySelector('#close').classList.contains('hidden')).toBe(true)
      document.querySelector('#postpone').click()
      expect(postpone).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(6100)
      expect(document.querySelector('#postpone').classList.contains('hidden')).toBe(true)
      expect(document.querySelector('#close').classList.contains('hidden')).toBe(false)
      document.querySelector('#close').click()
      expect(finish).toHaveBeenCalledWith(false)
    })
    it('never exposes skip in strict mode and allows manual finish only on completion', async () => {
      await load(true, false)
      await vi.advanceTimersByTimeAsync(19000)
      expect(document.querySelector('#close').classList.contains('hidden')).toBe(true)
      expect(document.querySelector('#finish').classList.contains('hidden')).toBe(true)
      await manual(which)
      expect(document.querySelector('#finish').classList.contains('hidden')).toBe(false)
      expect(document.querySelector('#postpone').classList.contains('hidden')).toBe(true)
      expect(document.querySelector('.timer-remaining').getAttribute('stroke-dashoffset')).toBe('100')
      document.querySelector('#finish').click()
      expect(finish).toHaveBeenCalledWith(true)
      await vi.advanceTimersByTimeAsync(2000)
      expect(document.querySelector('#progress-time').textContent).toBe('00:21')
    })
    it('keeps long durations and safe customized ideas', async () => {
      await load(false, true, 3600000)
      expect(document.querySelector('#progress-time').textContent).toBe('60:00')
      expect(document.querySelector(file === 'break' ? '.break-idea' : '.microbreak-idea').textContent).toBe(file === 'break' ? idea[0] : idea)
    })
  })
}
