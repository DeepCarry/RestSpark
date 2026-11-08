// Visual presentation only; scheduling and eligibility stay in the existing renderers.
export function showBreakProgress (progress, time, milliseconds, elapsed = false) {
  const seconds = Math.max(0, elapsed ? Math.floor(milliseconds / 1000) : Math.ceil(milliseconds / 1000))
  time.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const remaining = Math.max(0, Math.min(1, progress.value / progress.max))
  document.querySelector('.timer-remaining').setAttribute('stroke-dashoffset', String((1 - remaining) * 100))
}
