const legacyIds = new Map([
  ['crystal-glass', 'gentle'],
  ['wind-chime', 'warm-chime']
])

const soundSettings = ['miniBreakAudio', 'longBreakAudio', 'miniBreakStartSound', 'longBreakStartSound']

// Match the quietest original (Tic Toc, about -34 LUFS) without amplifying any cue.
const gains = new Map([
  ['gentle', 0.644],
  ['warm-chime', 0.313],
  ['tic-toc', 1],
  ['reverie', 0.136]
])

export function migrateSoundSettings (settings) {
  const migrated = {}
  for (const key of soundSettings) {
    const replacement = legacyIds.get(settings[key])
    if (replacement) migrated[key] = replacement
  }
  return Object.keys(migrated).length ? { ...settings, ...migrated } : settings
}

export function createSoundPlayer (createAudio, onError) {
  let current
  let pending
  let fadeTimer

  function start ({ id, volume, preview }) {
    const audio = createAudio(`audio/${id}.wav`)
    current = { id, audio, preview }
    const release = () => {
      if (current?.audio === audio) current = null
    }
    audio.addEventListener('ended', release, { once: true })
    audio.volume = volume
    audio.play().catch(error => {
      if (current?.audio !== audio) return
      release()
      onError(id, error)
    })
  }

  return (file, volume, preview = false) => {
    const id = legacyIds.get(file) ?? file
    const gain = gains.get(id)
    if (!gain || !Number.isFinite(volume) || volume <= 0) return
    if (preview && ((current && !current.preview) || (pending && !pending.preview))) return

    const request = { id, volume: Math.min(volume, 1) * gain, preview }
    if (!current && !fadeTimer) {
      start(request)
      return
    }

    // A reminder takes priority. Rapid preview clicks keep just the latest choice.
    if (!fadeTimer && preview && current.id === id) return
    pending = request
    if (fadeTimer) return

    const { audio } = current
    const initialVolume = audio.volume
    let stepsLeft = 4
    fadeTimer = setInterval(() => {
      stepsLeft--
      audio.volume = initialVolume * stepsLeft / 4
      if (stepsLeft > 0) return

      clearInterval(fadeTimer)
      fadeTimer = null
      audio.pause()
      const next = pending
      pending = null
      start(next)
    }, 10)
  }
}
