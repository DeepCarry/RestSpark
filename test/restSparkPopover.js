import { describe, expect, it } from 'vitest'
import { popoverBounds, pauseChoices } from '../app/utils/restSparkPopover.js'

describe('tray popover', () => {
  it('anchors to the tray on the correct display and keeps a short screen usable', () => {
    const screen = { x: -800, y: 24, width: 800, height: 580 }
    const tray = { x: -36, y: 0, width: 22, height: 24 }
    const bounds = popoverBounds(tray, screen, 'options')
    expect(bounds).toMatchObject({ x: -338, y: 30, width: 330, height: 377 })
  })

  it('shows exact relative deadlines and tomorrow morning even before today’s morning time', () => {
    const now = new Date(2026, 10, 12, 4)
    const choices = pauseChoices(() => 8, now)
    expect(choices.map(choice => choice.id)).toEqual(['1h', '2h', '3h', '5h', 'morning'])
    expect(choices[2].until - +now).toBe(10800000)
    expect(choices[4].until).toBe(+new Date(2026, 10, 13, 8))
  })
})
