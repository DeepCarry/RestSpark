import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const evidence = join(root, 'docs/rest-spark/evidence')
const previous = JSON.parse(readFileSync(join(evidence, 'macos-qa.json')))
const { profile, legacy } = previous
const configPath = join(profile, 'config.json')
const config = JSON.parse(readFileSync(configPath))
config.restSparkRestartSentinel = 'keep-new-profile'
config.microbreakDuration = 90000
writeFileSync(configPath, JSON.stringify(config))
const originalLegacy = readFileSync(join(legacy, 'config.json'), 'utf8')
app.setPath('appData', dirname(profile))
app.setPath('userData', legacy)
app.setPath('logs', join(dirname(profile), 'restart-logs'))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
await import('../app/main.js')
app.whenReady().then(async () => {
  await delay(1200)
  assert.equal(app.getPath('userData'), profile)
  app.emit('second-instance', {}, [], root, ['preferences'])
  await delay(900)
  const preferences = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/preferences.html'))
  assert.ok(preferences)
  const settings = await preferences.webContents.executeJavaScript('window.settings.currentSettings()')
  assert.equal(settings.restSparkRestartSentinel, 'keep-new-profile')
  assert.equal(settings.microbreakDuration, 90000)
  assert.equal(readFileSync(join(legacy, 'config.json'), 'utf8'), originalLegacy)
  writeFileSync(join(evidence, 'restart-qa.json'), JSON.stringify({ passed: true, profile, retainedSentinel: true, retainedNewDuration: true, legacyBytesUnchanged: true }, null, 2))
  console.log('NORMAL_RESTART_PRESERVED_NEW_PROFILE')
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
