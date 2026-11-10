// All intervals and durations persist as milliseconds; each cadence is independent.
export const SCHEDULE_FIELDS = {
  microbreakInterval: { id: 'miniBreakEvery', min: 5, max: 60, step: 1, divisor: 60000, unit: 'minutes', presets: [10, 15, 20, 25, 30, 45, 60] },
  microbreakDuration: { id: 'miniBreakFor', min: 30, max: 300, step: 10, divisor: 1000, unit: 'seconds', presets: [30, 40, 50, 60, 90, 120, 180, 300] },
  longBreakInterval: { id: 'longBreakEvery', min: 30, max: 180, step: 1, divisor: 60000, unit: 'minutes', presets: [30, 45, 60, 90, 120, 180] },
  breakDuration: { id: 'longBreakFor', min: 3, max: 20, step: 1, divisor: 60000, unit: 'minutes', presets: [3, 5, 10, 15, 20] }
}

export function displayScheduleValue (key, value) {
  const field = SCHEDULE_FIELDS[key]
  return value / field.divisor
}

export function storedScheduleValue (key, value) {
  const field = SCHEDULE_FIELDS[key]
  return Number(value) * field.divisor
}

export function validScheduleValue (key, stored) {
  const field = SCHEDULE_FIELDS[key]
  if (!field || typeof stored !== 'number' || !Number.isFinite(stored)) return false
  const value = displayScheduleValue(key, stored)
  return Number.isInteger(value) && value >= field.min && value <= field.max && (value - field.min) % field.step === 0
}

export function validateSchedulePatch (current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, error: 'invalid' }
  const keys = Object.keys(patch)
  if (!keys.length || keys.some(key => !Object.hasOwn(SCHEDULE_FIELDS, key))) return { ok: false, error: 'invalid' }
  for (const key of keys) {
    // Existing advanced values may be displayed/resubmitted, never silently normalized.
    if (patch[key] !== current[key] && !validScheduleValue(key, patch[key])) return { ok: false, error: key }
  }
  return { ok: true }
}

export function saveSchedulePatch (store, patch) {
  const result = validateSchedulePatch(store.store, patch)
  if (!result.ok) return result
  try {
    store.set(patch)
    return { ok: true, settings: store.store }
  } catch {
    return { ok: false, error: 'saveFailed' }
  }
}
