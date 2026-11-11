import { DateTime } from 'luxon'
import MeeusSunMoon from 'meeussunmoon'

const heights = { running: 420, paused: 380, options: 480, protected: 400 }
const HOUR = 3600000

export function popoverBounds (tray, workArea, view) {
  const width = Math.min(workArea.width - 16, workArea.width < 900 ? 330 : 360)
  const x = Math.round(Math.min(workArea.x + workArea.width - width - 8,
    Math.max(workArea.x + 8, tray.x + tray.width / 2 - width / 2)))
  const y = Math.max(workArea.y, tray.y + tray.height) + 6
  const height = Math.max(1, Math.min(heights[view], Math.floor(workArea.height * 0.65), workArea.y + workArea.height - y - 8))
  return { x, y, width, height }
}

export function pauseChoices (get, now = new Date()) {
  const choices = [1, 2, 3, 5].map(hours => ({ id: `${hours}h`, until: +now + hours * HOUR }))
  const morning = get('morningHour')
  const tomorrow = DateTime.fromJSDate(now).plus({ days: 1 }).startOf('day')
  let sunrise
  if (morning === 'sunrise') {
    sunrise = MeeusSunMoon.sunrise(tomorrow, get('posLatitude'), get('posLongitude'))
  }
  const hour = Number(morning)
  const fallback = tomorrow.set({ hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 6 })
  choices.push({ id: 'morning', until: (sunrise?.isValid ? sunrise : fallback).toMillis() })
  return choices
}
