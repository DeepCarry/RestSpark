export const restPresets = {
  eyes: { microbreak: true, microbreakInterval: 1200000, microbreakDuration: 30000, break: true, longBreakInterval: 3600000, breakDuration: 300000 },
  balanced: { microbreak: true, microbreakInterval: 1800000, microbreakDuration: 60000, break: true, longBreakInterval: 3600000, breakDuration: 300000 },
  deep: { microbreak: false, microbreakInterval: 1800000, microbreakDuration: 60000, break: true, longBreakInterval: 3000000, breakDuration: 600000 }
}

export function shouldShowOnboarding (profile) {
  return !profile || (profile.isFirstRun === true && !profile.onboardingVersion)
}

export function onboardingPatch (preset, preferences) {
  const completed = { isFirstRun: false, onboardingVersion: 1 }
  if (preset === null) return completed
  if (!Object.hasOwn(restPresets, preset)) return null
  const { openAtLogin, monitorDnd, notify } = preferences || {}
  if ([openAtLogin, monitorDnd, notify].some(value => typeof value !== 'boolean')) return null
  return {
    ...restPresets[preset],
    ...completed,
    openAtLogin,
    monitorDnd,
    microbreakNotification: notify,
    breakNotification: notify
  }
}

export function presetForSchedule (settings) {
  for (const [name, preset] of Object.entries(restPresets)) {
    const matches = Object.entries(preset).every(([key, value]) =>
      (!preset.microbreak && ['microbreakInterval', 'microbreakDuration'].includes(key)) || settings[key] === value)
    if (matches) return name
  }
  return 'custom'
}
