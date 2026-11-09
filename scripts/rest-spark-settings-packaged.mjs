/* global WebSocket */
// Smoke the built macOS app with a disposable profile and loopback-only CDP.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, openSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:net'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const profile = join(tmpdir(), `rest-spark-packaged-${Date.now()}`)
const application = resolve(process.argv[2] || join(root, 'dist/mac-arm64/Rest Spark.app/Contents/MacOS/Rest Spark'))
const evidence = resolve(process.argv[3] || join(root, 'docs/rest-spark/settings-v1/evidence'))
mkdirSync(evidence, { recursive: true })
mkdirSync(profile, { recursive: true })
writeFileSync(join(profile, 'config.json'), JSON.stringify({ isFirstRun: false, language: 'zh-CN', disableAppUpdateFeatures: false, checkNewVersion: false, notifyNewVersion: false, naturalBreaks: false, monitorDnd: false, openAtLogin: false, _migratedOpenAtLogin: true }))
const reservation = createServer()
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const appLog = openSync(join(evidence, 'packaged-app.log'), 'w')
const child = spawn(application, [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', 'preferences'], { stdio: ['ignore', appLog, appLog] })
child.on('exit', (code, signal) => console.log('PACKAGED_APP_EXIT', code, signal))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket
let commandChild
let commandSent = false
try {
  let target
  for (let n = 0; n < 150; n++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      // Wait for the primary to own the lock and load its production process page.
      if (!commandSent && pages.some(page => page.url.endsWith('/process.html'))) {
        commandSent = true
        commandChild = spawn(application, [`--user-data-dir=${profile}`, 'preferences'], { stdio: ['ignore', appLog, appLog] })
      }
      target = pages.find(page => page.url.endsWith('/preferences.html'))
      if (target) break
    } catch {}
    await delay(100)
  }
  assert.ok(target, 'packaged preferences window loads')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let id = 0
  const pending = new Map()
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
    }
  }
  const send = (method, params = {}) => new Promise(resolve => {
    pending.set(++id, resolve)
    socket.send(JSON.stringify({ id, method, params }))
  })
  await delay(1000)
  const result = await send('Runtime.evaluate', { expression: '({ supportHidden: getComputedStyle(document.querySelector("[data-section=heart]")).display === "none", brand: document.querySelector(".rest-brand strong").textContent, heading: document.querySelector(".schedule h1").textContent, selected: document.querySelector("#miniBreakFor").selectedOptions[0].textContent, version: document.querySelector(".version").textContent, controls: document.querySelectorAll("select[data-divisor]").length })', returnByValue: true })
  const state = result.result.result.value
  assert.equal(state.supportHidden, true)
  assert.equal(state.heading, '休息计划')
  assert.equal(state.brand, '元气')
  assert.equal(state.controls, 4)
  assert.equal(state.version, JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version)
  // Capture all four pages and the actual update endpoint response in this build.
  const endpoint = 'https://api.github.com/repos/DeepCarry/RestSpark/releases/latest'
  const releaseResponse = await fetch(endpoint)
  const releaseState = { endpoint, status: releaseResponse.status }
  for (const section of ['settings', 'schedule', 'theme', 'about']) {
    await send('Runtime.evaluate', { expression: `document.querySelector('[data-section=${section}]').click()` })
    await delay(400)
    const translated = await send('Runtime.evaluate', {
      expression: `Array.from(document.querySelector('.${section}').querySelectorAll('[data-i18next]')).filter(element => element.textContent.trim() === element.dataset.i18next).map(element => element.dataset.i18next)`,
      returnByValue: true
    })
    assert.deepEqual(translated.result.result.value, [], `${section}: all translation keys resolve in the running application`)
    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(evidence, `packaged-${section}.png`), Buffer.from(screenshot.result.data, 'base64'))
    if (section === 'about') {
      const result = await send('Runtime.evaluate', { expression: '({ update: document.querySelector(\'.update-status\').textContent, version: document.querySelector(\'.version\').textContent, license: document.querySelector(\'#licenses\').textContent.includes(\'THIS SOFTWARE IS PROVIDED\') })', returnByValue: true })
      releaseState.ui = result.result.result.value
      assert.equal(releaseState.ui.version, state.version)
      assert.equal(releaseState.ui.license, true)
      assert.ok(!releaseState.ui.update.includes('N/A'))
    }
    await send('Runtime.evaluate', { expression: `document.querySelector('.${section}').scrollTop = document.querySelector('.${section}').scrollHeight` })
    await delay(200)
    const lower = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(evidence, `packaged-${section}-lower.png`), Buffer.from(lower.result.data, 'base64'))
  }
  writeFileSync(join(evidence, 'release-state.json'), JSON.stringify(releaseState, null, 2))
  writeFileSync(join(evidence, 'packaged-smoke.json'), JSON.stringify({ passed: true, profile, state }, null, 2))
  console.log('PACKAGED_MACOS_SMOKE_PASSED', state)
} finally {
  socket?.close()
  child.kill('SIGTERM')
  commandChild?.kill('SIGTERM')
}
