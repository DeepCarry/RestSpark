import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Rest Spark profile compatibility', () => {
  let root, source, target, migrateLegacyProfile, configureBrandIdentity
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'restspark-profile-test-'))
    source = join(root, 'Stretchly')
    target = join(root, 'Rest Spark')
    mkdirSync(source)
    const module = await import('../app/utils/brandProfile.js')
    migrateLegacyProfile = module.migrateLegacyProfile
    configureBrandIdentity = module.configureBrandIdentity
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))
  function seed () {
    const original = { language: 'zh-CN', microbreakDuration: 80000, breakStrictMode: true, mainColor: '#478484', unknownFutureKey: { manual: true }, __internal__: { migrations: { version: '1.20.0' } } }
    writeFileSync(join(source, 'config.json'), JSON.stringify(original))
    mkdirSync(join(source, 'images'))
    writeFileSync(join(source, 'images', 'custom.png'), 'custom image bytes')
    writeFileSync(join(source, 'stamp'), '2026-11-09')
    return original
  }
  it('copies settings, unknown fields and images without changing the original', () => {
    const original = seed()
    expect(migrateLegacyProfile({ source, target }).status).toBe('migrated')
    expect(JSON.parse(readFileSync(join(target, 'config.json')))).toEqual(original)
    expect(readFileSync(join(target, 'images', 'custom.png'), 'utf8')).toBe('custom image bytes')
    expect(readFileSync(join(target, 'stamp'), 'utf8')).toBe('2026-11-09')
    expect(JSON.parse(readFileSync(join(source, 'config.json')))).toEqual(original)
    expect(readFileSync(join(source, 'images', 'custom.png'), 'utf8')).toBe('custom image bytes')
  })
  it('never overwrites an existing new config, even when the old one later changes', () => {
    seed()
    migrateLegacyProfile({ source, target })
    writeFileSync(join(target, 'config.json'), '{"language":"en","userEdited":true}')
    writeFileSync(join(source, 'config.json'), '{"language":"fr"}')
    expect(migrateLegacyProfile({ source, target }).status).toBe('existing')
    expect(JSON.parse(readFileSync(join(target, 'config.json')))).toEqual({ language: 'en', userEdited: true })
  })
  it('does not silently replace corrupt legacy configuration with defaults', () => {
    writeFileSync(join(source, 'config.json'), '{broken')
    expect(() => migrateLegacyProfile({ source, target })).toThrow()
    expect(existsSync(join(target, 'config.json'))).toBe(false)
    expect(readFileSync(join(source, 'config.json'), 'utf8')).toBe('{broken')
  })
  it('is safe for a fresh install and never copies browser caches or locks', () => {
    expect(migrateLegacyProfile({ source, target }).status).toBe('missing')
    seed()
    writeFileSync(join(source, 'SingletonLock'), 'lock')
    mkdirSync(join(source, 'Cache'))
    migrateLegacyProfile({ source, target })
    expect(existsSync(join(target, 'SingletonLock'))).toBe(false)
    expect(existsSync(join(target, 'Cache'))).toBe(false)
  })
  it('can retry after an assets conflict without publishing partial settings', () => {
    seed()
    mkdirSync(target)
    writeFileSync(join(target, 'images'), 'blocking file')
    expect(() => migrateLegacyProfile({ source, target })).toThrow()
    expect(existsSync(join(target, 'config.json'))).toBe(false)
    rmSync(join(target, 'images'))
    expect(migrateLegacyProfile({ source, target }).status).toBe('migrated')
  })
  it('rejects a non-object settings file', () => {
    writeFileSync(join(source, 'config.json'), '[]')
    expect(() => migrateLegacyProfile({ source, target })).toThrow()
  })
  it('preserves explicit login preferences even if the new bundle has a different native state', async () => {
    const { readSavedOpenAtLogin, resolveLoginPreference } = await import('../app/utils/brandProfile.js')
    writeFileSync(join(source, 'config.json'), '{"openAtLogin":true}')
    expect(resolveLoginPreference(readSavedOpenAtLogin(source), false)).toBe(true)
    writeFileSync(join(source, 'config.json'), '{"openAtLogin":false}')
    expect(resolveLoginPreference(readSavedOpenAtLogin(source), true)).toBe(false)
    writeFileSync(join(source, 'config.json'), '{}')
    expect(resolveLoginPreference(readSavedOpenAtLogin(source), true)).toBe(true)
  })
  it('respects an explicitly selected legacy-named directory and portable profiles', () => {
    const paths = { appData: root, userData: source }
    const app = { setName: () => {}, getPath: key => paths[key], setPath: (key, value) => { paths[key] = value }, commandLine: { hasSwitch: () => true } }
    expect(configureBrandIdentity(app).allowLegacyMigration).toBe(false)
    expect(paths.userData).toBe(source)
    app.commandLine.hasSwitch = () => false
    expect(configureBrandIdentity(app, { portable: true }).allowLegacyMigration).toBe(false)
    expect(paths.userData).toBe(source)
  })
  for (const [name, initial, custom] of [['legacy default', 'Stretchly', false], ['renamed default', 'rest-spark', false], ['explicit QA directory', 'isolated-test', true]]) {
    it(`routes ${name} without touching an explicit profile`, () => {
      const paths = { appData: root, userData: join(root, initial) }
      const fakeApp = { setName: value => { fakeApp.name = value }, getPath: key => paths[key], setPath: (key, value) => { paths[key] = value } }
      const identity = configureBrandIdentity(fakeApp)
      expect(fakeApp.name).toBe('Rest Spark')
      expect(paths.userData).toBe(custom ? join(root, initial) : target)
      expect(identity.allowLegacyMigration).toBe(!custom)
    })
  }
})
