import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export function readScheduleSettings (directory) {
  const path = join(directory, 'config.json')
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
}

export function migrateIndependentSchedule (store, original) {
  if (store.get('independentScheduleVersion') === 1) return
  const raw = original || {}
  const explicit = Number.isFinite(raw.longBreakInterval) && raw.longBreakInterval > 0
  const legacy = Number.isFinite(raw.microbreakInterval) && raw.microbreakInterval > 0 &&
    Number.isFinite(raw.breakInterval) && raw.breakInterval >= 0
  const interval = explicit ? raw.longBreakInterval : legacy ? raw.microbreakInterval * (raw.breakInterval + 1) : 3600000
  const backup = Object.fromEntries(['microbreakInterval', 'breakInterval', 'longBreakInterval']
    .filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]]))
  store.set({ longBreakInterval: interval, independentScheduleVersion: 1, independentScheduleBackup: backup })
}
