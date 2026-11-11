import { describe, expect, it } from 'vitest'
import { onboardingPatch, presetForSchedule, shouldShowOnboarding } from '../app/utils/restSparkOnboarding.js'

describe('first launch', () => {
  it('shows the wizard for new profiles without replaying it on upgrade', () => {
    expect(shouldShowOnboarding(null)).toBe(true)
    expect(shouldShowOnboarding({ microbreakInterval: 900000 })).toBe(false)
    expect(shouldShowOnboarding({ isFirstRun: false })).toBe(false)
    expect(shouldShowOnboarding({ isFirstRun: true, onboardingVersion: 1 })).toBe(false)
  })

  it('maps deep work to a long-only independent schedule and detects changes', () => {
    const patch = onboardingPatch('deep', { openAtLogin: false, monitorDnd: true, notify: true })
    expect(patch).toMatchObject({ microbreak: false, longBreakInterval: 3000000, breakDuration: 600000, isFirstRun: false })
    expect(presetForSchedule(patch)).toBe('deep')
    expect(presetForSchedule({ ...patch, breakDuration: 420000 })).toBe('custom')
  })

  it('skip writes only completion and rejects invalid settings payloads', () => {
    expect(onboardingPatch(null)).toEqual({ isFirstRun: false, onboardingVersion: 1 })
    expect(onboardingPatch('balanced', { openAtLogin: 'false' })).toBeNull()
  })
})
