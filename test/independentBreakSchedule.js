import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import BreaksPlanner from '../app/breaksPlanner.js'
vi.mock('../app/utils/naturalBreaksManager.js', () => ({ default: class extends EventEmitter { start () {} stop () {} } }))
vi.mock('../app/utils/dndManager.js', () => ({ default: class extends EventEmitter { start () {} stop () {} } }))
vi.mock('../app/utils/appExclusionsManager.js', () => ({ default: class extends EventEmitter { reset () {} reinitialize () {} } }))
const M = 60000
let planner, values, events
function setup (overrides = {}, automaticFinish = true, startDelay = 0) {
  values = { microbreak: true, break: true, microbreakInterval: 40 * M, longBreakInterval: 60 * M, microbreakDuration: M, breakDuration: 5 * M, microbreakNotification: false, breakNotification: false, microbreakNotificationInterval: 10000, breakNotificationInterval: 30000, microbreakPostponeTime: 2 * M, breakPostponeTime: 5 * M, breakInterval: 2, ...overrides }
  planner = new BreaksPlanner({ get: key => values[key], set: (key, value) => { values[key] = value } })
  events = []
  for (const [type, event, started] of [['mini', 'startMicrobreak', 'microbreakStarted'], ['long', 'startBreak', 'breakStarted']]) {
    planner.on(event, () => {
      events.push({ type, at: Date.now() })
      if (startDelay) setTimeout(() => planner.emit(started, false), startDelay)
      else planner.emit(started, false)
    })
  }
  if (automaticFinish) {
    planner.on('finishMicrobreak', () => planner.nextBreak())
    planner.on('finishBreak', () => planner.nextBreak())
  }
  planner.on('startMicrobreakNotification', () => planner.nextBreakAfterNotification())
  planner.on('startBreakNotification', () => planner.nextBreakAfterNotification())
  planner.nextBreak()
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0) })
afterEach(() => { planner?.scheduler?.cancel(); vi.clearAllTimers(); vi.useRealTimers() })
describe('independent break schedule', () => {
  it('schedules a60-minute long break despite a40-minute mini interval, excluding rest duration', () => {
    setup()
    vi.advanceTimersByTime(61 * M)
    expect(events).toEqual([{ type: 'mini', at: 40 * M }, { type: 'long', at: 61 * M }])
  })
  it('chooses only the long break when both become due and restarts the mini cadence afterwards', () => {
    setup({ microbreakInterval: 30 * M })
    vi.advanceTimersByTime(61 * M)
    expect(events.map(e => e.type)).toEqual(['mini', 'long'])
    vi.advanceTimersByTime(35 * M)
    expect(events.at(-1)).toEqual({ type: 'mini', at: 96 * M })
  })
  it('runs long-only on its own interval, independent of the disabled mini setting', () => {
    setup({ microbreak: false, microbreakInterval: 5 * M })
    vi.advanceTimersByTime(60 * M)
    expect(events).toEqual([{ type: 'long', at: 60 * M }])
  })
  it('runs mini-only repeatedly without injecting a disabled long break', () => {
    setup({ break: false, microbreakInterval: 20 * M })
    vi.advanceTimersByTime(62 * M)
    expect(events.map(e => e.type)).toEqual(['mini', 'mini', 'mini'])
  })
  it('keeps notification lead times on the same independent deadline', () => {
    setup({ microbreakNotification: true, breakNotification: true })
    vi.advanceTimersByTime(61 * M)
    expect(events).toEqual([{ type: 'mini', at: 40 * M }, { type: 'long', at: 61 * M }])
  })
  it('does not count manual-await time toward long work time', () => {
    setup({}, false)
    vi.advanceTimersByTime(50 * M)
    planner.nextBreak()
    expect(planner.timeToNextBreak).toBe(20 * M)
    vi.advanceTimersByTime(20 * M)
    expect(events.at(-1)).toEqual({ type: 'long', at: 70 * M })
  })
  it('a postponed mini cannot push an earlier long deadline back', () => {
    setup({ microbreakInterval: 59 * M, microbreakPostponeTime: 5 * M }, false)
    vi.advanceTimersByTime(59 * M)
    planner.postponeCurrentBreak()
    vi.advanceTimersByTime(M)
    expect(events.at(-1)).toEqual({ type: 'long', at: 60 * M })
    expect(planner.postponesNumber).toBe(0)
  })
  it('can postpone a long break without starting a stale mini during that wait', () => {
    setup({ microbreakInterval: 30 * M }, false)
    vi.advanceTimersByTime(30 * M); planner.nextBreak()
    vi.advanceTimersByTime(30 * M)
    expect(events.at(-1).type).toBe('long')
    planner.postponeCurrentBreak()
    vi.advanceTimersByTime(5 * M)
    expect(events.map(e => e.type)).toEqual(['mini', 'long', 'long'])
  })
  it('pause/resume resets cadences and excludes paused time', () => {
    setup()
    vi.advanceTimersByTime(20 * M); planner.pause(1)
    vi.advanceTimersByTime(120 * M); planner.resume()
    vi.advanceTimersByTime(39 * M)
    expect(events).toHaveLength(0)
    vi.advanceTimersByTime(M)
    expect(events[0]).toEqual({ type: 'mini', at: 180 * M })
  })
  it('persists the absolute deadline and restores it in a new planner', () => {
    setup()
    vi.setSystemTime(3 * M)
    planner.pause(60 * M)
    expect(values.manualPauseUntil).toBe(63 * M)
    const restarted = new BreaksPlanner({ get: key => values[key], set: (key, value) => { values[key] = value } })
    restarted.nextBreak()
    expect(restarted.isPaused).toBe(true)
    vi.setSystemTime(64 * M)
    restarted.correctScheduler()
    expect(restarted.isPaused).toBe(false)
    expect(values.manualPauseUntil).toBe(0)
    expect(restarted.timeToNextBreak).toBe(40 * M)
  })
  it('waits for both Focus and idle to clear after a timed pause expires', () => {
    setup()
    planner.pause(M)
    planner.dndManager.isOnDnd = true
    planner.dndManager.emit('dndStarted')
    planner.naturalBreaksManager.isSchedulerCleared = true
    planner.naturalBreaksManager.emit('clearBreakScheduler')
    vi.advanceTimersByTime(M)
    expect(planner.isPaused).toBe(false)
    expect(planner.timeToNextBreak).toBeNull()
    planner.dndManager.isOnDnd = false
    planner.dndManager.emit('dndFinished')
    expect(planner.timeToNextBreak).toBeNull()
    planner.naturalBreaksManager.isSchedulerCleared = false
    planner.naturalBreaksManager.emit('naturalBreakFinished')
    expect(planner.timeToNextBreak).toBe(40 * M)
  })
  it('leaves a manually started break open when Focus activates', () => {
    setup({}, false)
    planner.skipToMicrobreak()
    vi.advanceTimersByTime(100)
    planner.dndManager.isOnDnd = true
    planner.dndManager.emit('dndStarted')
    expect(planner.scheduler.reference).toBe('finishMicrobreak')
    planner.nextBreak()
    expect(planner.timeToNextBreak).toBeNull()
  })
  it('cancels a delayed manual break on lock and starts fresh after unlock', () => {
    setup()
    planner.skipToMicrobreak(M)
    planner.setPowerBlock('lock', true)
    vi.advanceTimersByTime(M)
    expect(events).toHaveLength(0)
    planner.setPowerBlock('lock', false)
    expect(planner.timeToNextBreak).toBe(40 * M)
  })
  it('replans a new long interval using work already elapsed, without interrupting an active break', () => {
    setup()
    vi.advanceTimersByTime(20 * M)
    values.longBreakInterval = 30 * M; planner.replan()
    expect(planner.timeToNextBreak).toBe(10 * M)
    vi.advanceTimersByTime(10 * M)
    values.longBreakInterval = 180 * M; planner.replan()
    expect(planner.scheduler.reference).toBe('finishBreak')
  })
  it('enabling long breaks starts a fresh long cadence rather than triggering immediately', () => {
    setup({ break: false })
    vi.advanceTimersByTime(90 * M)
    values.break = true; planner.replan()
    expect(planner.timeToLongBreak).toBe(60 * M)
  })
  it('manual long breaks reset both cadences', () => {
    setup()
    vi.advanceTimersByTime(10 * M); planner.skipToBreak()
    vi.advanceTimersByTime(100 + 5 * M)
    expect(planner.timeToNextBreak).toBe(40 * M)
    expect(planner.timeToLongBreak).toBe(60 * M)
  })
  it('does not stretch a short remaining delay to a longer notification lead', () => {
    setup({ microbreak: false, longBreakInterval: 5000, breakNotification: true, breakNotificationInterval: 30000 })
    expect(planner.timeToNextBreak).toBe(5000)
    expect(planner._progressInterval).toBe(5000)
    expect(planner.notificationLead).toBe(5000)
    vi.advanceTimersByTime(5000)
    expect(events).toEqual([{ type: 'long', at: 5000 }])
  })
  it('does not replan another reminder while the first window is loading', () => {
    setup({}, true, 1000)
    vi.advanceTimersByTime(40 * M)
    values.longBreakInterval = 20 * M
    planner.replan()
    vi.advanceTimersByTime(500)
    expect(events.map(e => e.type)).toEqual(['mini'])
    expect(planner.scheduler.reference).toBe('startMicrobreak')
    vi.advanceTimersByTime(500)
    expect(planner.scheduler.reference).toBe('finishMicrobreak')
  })
  it('after sleep without pause prioritizes the overdue long break instead of replaying a stale mini', () => {
    setup()
    vi.setSystemTime(120 * M)
    planner.correctScheduler()
    vi.advanceTimersByTime(1)
    expect(events.map(e => e.type)).toEqual(['long'])
  })
  it('closing a loading mini still completes its cadence rather than immediately reopening it', () => {
    setup({}, false, 1000)
    vi.advanceTimersByTime(40 * M)
    planner.nextBreak()
    expect(planner.timeToNextBreak).toBe(20 * M)
    expect(planner._scheduledBreakType).toBe('break')
  })
  it('manually replacing a loading long break with a mini resets the overdue long cadence', () => {
    setup({ microbreak: false }, false, 1000)
    vi.advanceTimersByTime(60 * M)
    planner.skipToMicrobreak()
    vi.advanceTimersByTime(100)
    expect(planner.timeToLongBreak).toBeGreaterThan(59 * M)
  })
})
