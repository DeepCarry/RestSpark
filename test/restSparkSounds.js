import { describe, expect, it, vi } from 'vitest'
import defaults from '../app/utils/defaultSettings.js'
import { createSoundPlayer, migrateSoundSettings } from '../app/utils/restSparkSounds.js'

describe('Rest Spark sounds', () => {
  it('defaults to Gentle at the end of either break and keeps start sounds off', () => {
    expect(defaults).toMatchObject({
      miniBreakAudio: 'gentle',
      longBreakAudio: 'gentle',
      miniBreakStartSound: 'silence',
      longBreakStartSound: 'silence'
    })
  })

  it('migrates old IDs independently and preserves existing choices, mute and volume', () => {
    const saved = {
      miniBreakAudio: 'crystal-glass',
      longBreakAudio: 'wind-chime',
      miniBreakStartSound: 'tic-toc',
      longBreakStartSound: 'reverie',
      silentNotifications: true,
      volume: 0.4
    }
    const migrated = migrateSoundSettings(saved)
    expect(migrated).toEqual({ ...saved, miniBreakAudio: 'gentle', longBreakAudio: 'warm-chime' })
    expect(migrateSoundSettings(migrated)).toEqual(migrated)
    expect(migrateSoundSettings({ miniBreakStartSound: 'wind-chime', longBreakStartSound: 'crystal-glass' }))
      .toEqual({ miniBreakStartSound: 'warm-chime', longBreakStartSound: 'gentle' })
  })

  it('fades out the current preview, keeps only the latest request and gives reminders priority', async () => {
    vi.useFakeTimers()
    try {
      const played = []
      const active = new Set()
      const createAudio = path => ({
        volume: 1,
        addEventListener () {},
        play () {
          expect(active.size).toBe(0)
          active.add(this)
          played.push({ path, volume: this.volume })
          return Promise.resolve()
        },
        pause () {
          expect(this.volume).toBe(0)
          active.delete(this)
        }
      })
      const play = createSoundPlayer(createAudio, () => {})
      play('gentle', 0.5, true)
      play('gentle', 0.5, true)
      play('tic-toc', 1, true)
      play('reverie', 1, true)
      play('wind-chime', 0.4)
      play('tic-toc', 1, true)
      play('silence', 1)
      play('../bad', 1)
      await vi.runAllTimersAsync()
      play('reverie', 1, true)
      expect(played.map(sound => sound.path)).toEqual(['audio/gentle.wav', 'audio/warm-chime.wav'])
      expect(played[1].volume).toBeCloseTo(0.4 * 0.314, 3)
    } finally {
      vi.useRealTimers()
    }
  })
})
