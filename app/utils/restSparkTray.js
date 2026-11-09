// The approved mark remains untouched; macOS renders status beside its template.
export const macTrayAsset = 'restsparkTemplate.png'

export function trayStatusTitle ({ paused, trayIconStyle, timeToBreak, percentage, reference }) {
  if (paused) return 'Ⅱ'
  if (reference === 'finishMicrobreak' || reference === 'finishBreak') return ''
  if (trayIconStyle === 'time' && Number.isInteger(timeToBreak) && timeToBreak >= 0) return String(timeToBreak)
  if (trayIconStyle === 'progress' && Number.isInteger(percentage) && percentage >= 0 && percentage <= 100) return `${percentage}%`
  return ''
}
