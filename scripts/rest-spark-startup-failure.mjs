// Exercise production initialization/quit; suppress only the blocking native dialog.
import { app, dialog } from 'electron'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'

const scenario = process.argv.includes('--assets-conflict') ? 'assets-conflict' : 'corrupt-json'
const root = resolve(import.meta.dirname, '..')
const sandbox = mkdtempSync(join(tmpdir(), 'rest-spark-startup-failure-'))
const source = join(sandbox, 'Stretchly')
const target = join(sandbox, 'Rest Spark')
mkdirSync(source)
const original = scenario === 'corrupt-json' ? '{invalid JSON' : '{"language":"zh-CN"}'
writeFileSync(join(source, 'config.json'), original)
if (scenario === 'assets-conflict') {
  mkdirSync(join(source, 'images'))
  writeFileSync(join(source, 'images', 'test.png'), 'test')
  mkdirSync(target)
  writeFileSync(join(target, 'images'), 'blocking file')
}
app.setPath('appData', sandbox)
app.setPath('userData', source)
app.setPath('logs', join(sandbox, 'logs'))
let dialogMessage
let cleanQuit = false
// Native modal is the only mocked boundary; app.quit and its production handlers run.
dialog.showErrorBox = (title, message) => { dialogMessage = `${title}\n${message}` }
app.once('will-quit', () => {
  assert.ok(dialogMessage?.includes('Rest Spark'))
  assert.ok(dialogMessage.includes(source) && dialogMessage.includes(target))
  assert.equal(existsSync(join(target, 'config.json')), false)
  assert.equal(readFileSync(join(source, 'config.json'), 'utf8'), original)
  cleanQuit = true
  clearTimeout(timeout)
  writeFileSync(join(root, `docs/rest-spark/evidence/startup-${scenario}.json`), JSON.stringify({ passed: true, cleanQuit, dialogMessage, originalIntact: true, targetConfigNotPublished: true }, null, 2))
  console.log('CLEAN_STARTUP_FAILURE_EXIT', scenario)
})
await import('../app/main.js')
const timeout = setTimeout(() => {
  console.error('STARTUP_FAILURE_DID_NOT_QUIT_CLEANLY', scenario, dialogMessage)
  app.exit(1)
}, 8000)
