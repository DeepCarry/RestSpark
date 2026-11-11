// Run with Electron and an empty, disposable directory in REST_SOUND_QA.
import { app, BrowserWindow } from 'electron'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const evidence = process.env.REST_SOUND_QA
assert.ok(evidence, 'Set REST_SOUND_QA to a disposable evidence directory')
const profile = join(evidence, 'profile')
const configPath = join(profile, 'config.json')
const restart = process.argv.includes('--restart')
const fresh = process.argv.includes('--fresh')
const ids = ['gentle', 'warm-chime', 'tic-toc', 'reverie']
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const config = () => JSON.parse(readFileSync(configPath, 'utf8'))
const windowFor = page => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/' + page + '.html'))
const command = name => app.emit('second-instance', {}, [], import.meta.dirname, [name])
async function until (condition, label, timeout = 10000) {
  const deadline = Date.now() + timeout
  do {
    const result = await condition()
    if (result) return result
    await delay(40)
  } while (Date.now() < deadline)
  assert.fail(label)
}

mkdirSync(profile, { recursive: true })
app.setPath('userData', profile)
app.setPath('logs', join(evidence, 'logs'))
if (!restart && !fresh) {
  writeFileSync(configPath, JSON.stringify({
    language: 'zh-CN',
    isFirstRun: false,
    openAtLogin: false,
    _migratedOpenAtLogin: true,
    disableAppUpdateFeatures: true,
    checkNewVersion: false,
    monitorDnd: false,
    naturalBreaks: false,
    allScreens: false,
    microbreakDuration: 2300,
    breakDuration: 3200,
    microbreakNotification: false,
    breakNotification: false,
    miniBreakAudio: 'crystal-glass',
    longBreakAudio: 'wind-chime',
    miniBreakStartSound: 'crystal-glass',
    longBreakStartSound: 'wind-chime',
    volume: 1,
    manualField: 'preserve'
  }), { flag: 'wx' })
}

await import('../app/main.js')
app.whenReady().then(async () => {
  const player = await until(() => windowFor('process'), 'process window opens')
  await until(() => !player.webContents.isLoading(), 'process window loads')
  if (fresh) {
    assert.equal(config().miniBreakAudio, 'gentle')
    assert.equal(config().longBreakAudio, 'gentle')
    assert.equal(config().miniBreakStartSound, 'silence')
    assert.equal(config().longBreakStartSound, 'silence')
    console.log('Fresh profile defaults passed')
    app.exit(0)
  } else {
    await run(player)
    app.exit(0)
  }
}).catch(error => {
  console.error(error)
  app.exit(1)
})

async function run (player) {
  const readPlayer = code => player.webContents.executeJavaScript(code)
  const events = () => readPlayer('window.soundEvents')
  command('preferences')
  const prefs = await until(() => windowFor('preferences'), 'preferences window opens')
  const js = code => prefs.webContents.executeJavaScript(code)
  const selected = () => js('document.querySelector("[name=longBreakAudio]:checked")?.value')
  await until(() => selected(), 'sound selection bound')
  const save = (key, value) => js(`window.settings.saveSettings(${JSON.stringify(key)}, ${JSON.stringify(value)})`)
  await js('document.querySelector("[data-section=theme]").click()')
  const capture = async language => {
    const expected = language === 'en' ? ['Gentle', 'Warm Chime', 'Tic Toc', 'Reverie'] : ['轻柔', '和煦', '滴答', '悠然']
    await until(async () => JSON.stringify(await js('Array.from(document.querySelectorAll(".sounds label"), label => label.textContent.trim())')) === JSON.stringify(expected), language + ' labels')
    prefs.show()
    prefs.focus()
    await js('document.querySelector("[data-preview-sound=gentle]").closest("section").scrollIntoView({ block: "center" })')
    await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    await delay(250)
    writeFileSync(join(evidence, language + '.png'), (await prefs.webContents.capturePage()).toPNG())
  }
  if (restart) {
    assert.equal(await selected(), 'reverie')
    assert.equal(config().miniBreakAudio, 'reverie')
    assert.equal(config().miniBreakStartSound, 'gentle')
    assert.equal(config().longBreakStartSound, 'warm-chime')
    assert.equal(config().manualField, 'preserve')
    await capture('en')
    console.log('Cold restart retained selection and migrated settings')
    return
  }
  assert.equal(await selected(), 'warm-chime')
  assert.equal(config().miniBreakAudio, 'gentle')
  assert.equal(config().miniBreakStartSound, 'gentle')
  assert.equal(config().longBreakStartSound, 'warm-chime')
  assert.equal(config().manualField, 'preserve')
  await capture('zh-CN')
  await readPlayer(`(() => {
    window.soundEvents = [];
    const NativeAudio = window.Audio;
    let active = 0;
    window.Audio = function (url) {
      const audio = new NativeAudio(url);
      let playing = false;
      for (const event of ['playing', 'pause', 'ended', 'error']) {
        audio.addEventListener(event, () => {
          if (event === 'playing' && !playing) { playing = true; active++; }
          if ((event === 'pause' || event === 'ended') && playing) { playing = false; active--; }
          window.soundEvents.push({ url, event, active, volume: audio.volume, time: audio.currentTime, duration: audio.duration });
        });
      }
      return audio;
    };
  })()`)
  const clickPreview = id => js(`document.querySelector('[data-preview-sound="${id}"]').click()`)
  const waitForPlayback = async (id, offset, complete = true) => {
    const url = 'audio/' + id + '.wav'
    const find = async kind => (await events()).slice(offset).find(event => event.event === kind && event.url === url)
    const playing = await until(() => find('playing'), url + ' enters playing')
    await until(() => player.webContents.isCurrentlyAudible(), url + ' audible in Electron')
    if (complete) {
      const ended = await until(() => find('ended'), url + ' reaches natural end')
      assert.equal(ended.time, ended.duration)
    }
    return playing
  }
  for (const id of ids) {
    const offset = (await events()).length
    await clickPreview(id)
    assert.equal(await selected(), 'warm-chime', 'preview leaves selection alone')
    await waitForPlayback(id, offset)
  }
  let offset = (await events()).length
  await clickPreview('reverie')
  await waitForPlayback('reverie', offset, false)
  await js(`for (const id of ['tic-toc', 'gentle', 'warm-chime', 'warm-chime']) {
    document.querySelector('[data-preview-sound="' + id + '"]').click();
  }`)
  await waitForPlayback('warm-chime', offset)
  assert.deepEqual((await events()).slice(offset).filter(e => e.event === 'playing').map(e => e.url), ['audio/reverie.wav', 'audio/warm-chime.wav'])
  assert.ok((await events()).slice(offset).some(e => e.url === 'audio/reverie.wav' && e.event === 'pause' && e.volume === 0))

  for (const [type, page, start, finish] of [
    ['mini', 'microbreak', 'gentle', 'tic-toc'],
    ['long', 'break', 'warm-chime', 'reverie']
  ]) {
    await js(`document.querySelector('input[value="${finish}"]').click()`)
    await until(() => config().miniBreakAudio === finish && config().longBreakAudio === finish, 'selection saved for both break types')
    offset = (await events()).length
    command(type)
    await until(() => windowFor(page), page + ' actual reminder opens')
    await waitForPlayback(start, offset)
    await waitForPlayback(finish, offset)
  }
  await save('silentNotifications', true)
  await until(() => config().silentNotifications, 'global mute saved')
  offset = (await events()).length
  command('mini')
  await until(() => windowFor('microbreak'), 'muted break opens')
  await until(() => !windowFor('microbreak'), 'muted break finishes')
  await delay(300)
  assert.equal((await events()).length, offset, 'mute suppresses both automatic sounds')
  await save('volume', 0.5)
  await until(() => config().volume === 0.5, 'volume saved')
  await clickPreview('gentle')
  const reduced = await waitForPlayback('gentle', offset)
  const full = (await events()).find(e => e.url === 'audio/gentle.wav' && e.event === 'playing')
  assert.ok(Math.abs(reduced.volume / full.volume - 0.5) < 0.001, 'explicit audition uses the saved volume even when reminders are muted')
  await save('silentNotifications', false)
  await save('language', 'en')
  await capture('en')
  const media = await events()
  assert.ok(media.every(e => e.active <= 1 && e.event !== 'error'))
  writeFileSync(join(evidence, 'native-media.json'), JSON.stringify(media, null, 2))
  console.log('Native macOS previews, break starts and finishes, migration, rapid clicks, mute, volume and language passed')
}
