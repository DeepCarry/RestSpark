import { describe, it, expect } from 'vitest'
import { SCHEDULE_FIELDS, validateSchedulePatch, saveSchedulePatch } from '../app/utils/scheduleControls.js'

const current = { microbreakInterval: 1200000, microbreakDuration: 30000, longBreakInterval: 3600000, breakDuration: 300000, manual: 'keep' }
describe('schedule input rules and persistence', () => {
  for (const [key, invalid] of [
    ['microbreakDuration', [0, 20000, 35000, 310000, NaN, Infinity, '30000']],
    ['microbreakInterval', [0, 240000, 3660000, 915000, NaN]],
    ['breakDuration', [60000, 1260000, 210000, NaN]],
    ['longBreakInterval', [0, 1740000, 10860000, 3630000, NaN]]
  ]) {
    for (const value of invalid) {
      it(`rejects ${key}=${value} without mutation`, () => {
        expect(validateSchedulePatch(current, { [key]: value }).ok).toBe(false)
        expect(current.manual).toBe('keep')
      })
    }
  }
  it('accepts inclusive boundaries and standard custom values', () => {
    for (const value of [30000, 40000, 300000]) expect(validateSchedulePatch(current, { microbreakDuration: value }).ok).toBe(true)
    for (const value of [300000, 3600000]) expect(validateSchedulePatch(current, { microbreakInterval: value, longBreakInterval: 3600000 }).ok).toBe(true)
    for (const value of [180000, 1200000]) expect(validateSchedulePatch(current, { breakDuration: value }).ok).toBe(true)
  })
  it('preserves advanced legacy values while changing a different field', () => {
    const legacy = { ...current, microbreakDuration: 80500, microbreakInterval: 3900000, longBreakInterval: 55800000, breakDuration: 3600000 }
    expect(validateSchedulePatch(legacy, { microbreakDuration: 40000 }).ok).toBe(true)
    expect(validateSchedulePatch(legacy, { breakDuration: 300000 }).ok).toBe(true)
    expect(validateSchedulePatch(legacy, { microbreakDuration: 80500 }).ok).toBe(true)
  })
  it('accepts independent40-minute mini and60-minute long intervals and six presets', () => {
    expect(validateSchedulePatch(current, { microbreakInterval: 2400000, longBreakInterval: 3600000 }).ok).toBe(true)
    expect(validateSchedulePatch(current, { longBreakInterval: 10800000 }).ok).toBe(true)
    expect(SCHEDULE_FIELDS.longBreakInterval.presets).toEqual([30, 45, 60, 90, 120, 180])
    expect(validateSchedulePatch(current, { breakInterval: 2 }).ok).toBe(false)
  })
  it('rejects empty or unrelated patches', () => {
    expect(validateSchedulePatch(current, {}).ok).toBe(false)
    expect(validateSchedulePatch(current, { openAtLogin: true }).ok).toBe(false)
  })
  it('writes the entire valid patch once and never writes invalid input', () => {
    let values = { ...current }; const writes = []
    const store = { get store () { return values }, set: patch => { writes.push(patch); values = { ...values, ...patch } } }
    expect(saveSchedulePatch(store, { microbreakDuration: 1000 }).ok).toBe(false)
    expect(writes).toHaveLength(0)
    expect(saveSchedulePatch(store, { microbreakInterval: 2700000, longBreakInterval: 3600000 }).ok).toBe(true)
    expect(writes).toEqual([{ microbreakInterval: 2700000, longBreakInterval: 3600000 }])
    expect(values.manual).toBe('keep')
  })
  it('keeps preset lists short', () => {
    expect(Object.values(SCHEDULE_FIELDS).every(field => field.presets.length <= 8)).toBe(true)
  })
})
