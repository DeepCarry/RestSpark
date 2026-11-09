import { describe, it, expect } from 'vitest'

describe('Rest Spark native macOS tray status', () => {
  it('uses the immutable approved template in every appearance', async () => {
    const { macTrayAsset } = await import('../app/utils/restSparkTray.js')
    expect(macTrayAsset).toBe('restsparkTemplate.png')
  })
  it('retains time/progress/paused status without modifying approved logo geometry', async () => {
    const { trayStatusTitle } = await import('../app/utils/restSparkTray.js')
    expect(trayStatusTitle({ paused: false, trayIconStyle: 'default' })).toBe('')
    expect(trayStatusTitle({ paused: true, trayIconStyle: 'time', timeToBreak: 7 })).toBe('Ⅱ')
    expect(trayStatusTitle({ trayIconStyle: 'time', timeToBreak: 7, reference: 'startMicrobreak' })).toBe('7')
    expect(trayStatusTitle({ trayIconStyle: 'progress', percentage: 32, reference: 'startBreak' })).toBe('32%')
    expect(trayStatusTitle({ trayIconStyle: 'progress', percentage: 0 })).toBe('0%')
    expect(trayStatusTitle({ trayIconStyle: 'progress', percentage: 100 })).toBe('100%')
    expect(trayStatusTitle({ trayIconStyle: 'progress', percentage: 101 })).toBe('')
    expect(trayStatusTitle({ trayIconStyle: 'time', timeToBreak: -1 })).toBe('')
    expect(trayStatusTitle({ trayIconStyle: 'time', timeToBreak: 4, reference: 'finishMicrobreak' })).toBe('')
    expect(trayStatusTitle({ trayIconStyle: 'progress', percentage: 20, reference: 'finishBreak' })).toBe('')
  })
})
