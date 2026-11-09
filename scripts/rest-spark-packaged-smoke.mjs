/* global WebSocket */
// Smoke the built macOS app with a disposable profile and loopback-only CDP.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, openSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:net'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const profile = join(tmpdir(), `rest-spark-packaged-${Date.now()}`)
const application = resolve(process.argv[2] || join(root, 'dist/mac-arm64/Rest Spark.app/Contents/MacOS/Rest Spark'))
const evidence = resolve(process.argv[3] || join(root, 'docs/rest-spark/evidence'))
mkdirSync(evidence, { recursive: true })
mkdirSync(profile, { recursive: true })
writeFileSync(join(profile, 'config.json'), JSON.stringify({ isFirstRun: false, language: 'zh-CN', disableAppUpdateFeatures: true, checkNewVersion: false, notifyNewVersion: false, naturalBreaks: false, monitorDnd: false, openAtLogin: false, _migratedOpenAtLogin: true }))
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
  assert.equal(state.version, '1.20.0')
  const screenshot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(evidence, 'packaged-schedule.png'), Buffer.from(screenshot.result.data, 'base64'))
  await send('Runtime.evaluate', { expression: 'document.querySelector("[data-section=about]").click()' })
  await delay(500)
  const aboutShot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(evidence, 'packaged-about.png'), Buffer.from(aboutShot.result.data, 'base64'))
  writeFileSync(join(evidence, 'packaged-smoke.json'), JSON.stringify({ passed: true, profile, state }, null, 2))
  console.log('PACKAGED_MACOS_SMOKE_PASSED', state)
} finally {
  socket?.close()
  child.kill('SIGTERM')
  commandChild?.kill('SIGTERM')
}
