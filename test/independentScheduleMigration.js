import { describe, it, expect } from 'vitest'
import { migrateIndependentSchedule } from '../app/utils/independentScheduleMigration.js'
function profile (raw) {
  let values = { microbreakInterval: 1200000, breakInterval: 2, longBreakInterval: 3600000, manual: { retained: true }, ...raw }
  let writes = 0
  const store = { get: key => values[key], set: patch => { values = { ...values, ...patch }; writes++ }, get store () { return values } }
  return { store, values: () => values, writes: () => writes }
}
describe('independent long interval migration', () => {
  for (const [mini, count, expected] of [[2400000, 2, 7200000], [1500000, 3, 6000000], [1800000, 30, 55800000]]) {
    it(`preserves the legacy effective interval ${mini}×${count + 1}`, () => {
      const raw = { microbreakInterval: mini, breakInterval: count }
      const p = profile(raw)
      migrateIndependentSchedule(p.store, raw)
      expect(p.values().longBreakInterval).toBe(expected)
      expect(p.values().independentScheduleBackup).toEqual(raw)
      expect(p.values().manual).toEqual({ retained: true })
      expect(p.values().breakInterval).toBe(count)
      migrateIndependentSchedule(p.store, p.values())
      expect(p.writes()).toBe(1)
    })
  }
  it('uses60minutes for a fresh profile without legacy schedule keys', () => {
    const p = profile({})
    migrateIndependentSchedule(p.store, { isFirstRun: false })
    expect(p.values().longBreakInterval).toBe(3600000)
  })
  it('preserves an explicitly configured minute interval', () => {
    const raw = { microbreakInterval: 2400000, breakInterval: 2, longBreakInterval: 10800000 }
    const p = profile(raw); migrateIndependentSchedule(p.store, raw)
    expect(p.values().longBreakInterval).toBe(10800000)
  })
})
