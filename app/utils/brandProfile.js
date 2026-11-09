import { existsSync, mkdirSync, mkdtempSync, cpSync, readFileSync, writeFileSync, linkSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { BRAND } from './brand.js'

export function configureBrandIdentity (app, { portable = false } = {}) {
  const appData = app.getPath('appData')
  const current = app.getPath('userData')
  const source = join(appData, 'Stretchly')
  const target = join(appData, BRAND.name)
  const defaultNames = ['Stretchly', 'stretchly', 'rest-spark', BRAND.name]
  const explicit = app.commandLine?.hasSwitch('user-data-dir') || portable ||
    !defaultNames.some(name => resolve(current) === resolve(join(appData, name)))
  app.setName(BRAND.name)
  // Keep test, portable and manually chosen profiles exactly where requested.
  app.setPath('userData', explicit ? current : target)
  return { source, target: explicit ? current : target, allowLegacyMigration: !explicit }
}

export function migrateLegacyProfile ({ source, target }) {
  const config = join(target, 'config.json')
  if (resolve(source) === resolve(target) || existsSync(config)) return { status: 'existing' }
  const legacyConfig = join(source, 'config.json')
  if (!existsSync(legacyConfig)) return { status: 'missing' }
  const bytes = readFileSync(legacyConfig)
  const parsed = JSON.parse(bytes.toString('utf8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Legacy Stretchly config.json must contain a settings object')

  mkdirSync(target, { recursive: true })
  const staging = mkdtempSync(join(target, '.rest-spark-import-'))
  try {
    // Copy only owned user content, not Chromium caches, locks or machine state.
    for (const name of ['images', 'stamp']) {
      const from = join(source, name)
      const staged = join(staging, name)
      const to = join(target, name)
      if (!existsSync(from)) continue
      cpSync(from, staged, { recursive: true })
      if (name === 'images' && existsSync(to) && !statSync(to).isDirectory()) {
        throw new Error('Rest Spark images path is not a directory')
      }
      if (name === 'stamp' && existsSync(to)) continue
      cpSync(staged, to, { recursive: true, force: false, errorOnExist: false })
    }
    const stagedConfig = join(staging, 'config.json')
    // Retain bytes, unknown/manual fields and electron-store migration metadata.
    writeFileSync(stagedConfig, bytes, { flag: 'wx' })
    // Link publishes a complete file atomically and can never overwrite a target.
    try {
      linkSync(stagedConfig, config)
    } catch (error) {
      if (error.code === 'EEXIST') return { status: 'existing' }
      throw error
    }
    return { status: 'migrated' }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

export function readSavedOpenAtLogin (directory) {
  const config = join(directory, 'config.json')
  if (!existsSync(config)) return
  const value = JSON.parse(readFileSync(config, 'utf8')).openAtLogin
  if (typeof value === 'boolean') return value
}

export function resolveLoginPreference (saved, native) {
  return typeof saved === 'boolean' ? saved : native
}
