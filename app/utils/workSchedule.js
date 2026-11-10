// Only time spent waiting/working advances the independent cadences.
export default class WorkSchedule {
  constructor () {
    this.elapsed = { microbreak: 0, break: 0 }
    this.enabled = { microbreak: true, break: true }
    this.startedAt = null
  }

  commit () {
    if (this.startedAt === null) return
    const now = Date.now()
    const duration = Math.max(0, now - this.startedAt)
    for (const type of ['microbreak', 'break']) {
      if (this.enabled[type]) this.elapsed[type] += duration
    }
    this.startedAt = now
  }

  sync (settings) {
    this.commit()
    for (const type of ['microbreak', 'break']) {
      const enabled = Boolean(settings.get(type))
      if (this.enabled[type] !== enabled) this.elapsed[type] = 0
      this.enabled[type] = enabled
    }
  }

  start (settings) {
    this.sync(settings)
    if (this.startedAt === null) this.startedAt = Date.now()
  }

  stop () {
    this.commit()
    this.startedAt = null
  }

  interval (type, settings) {
    return settings.get(type === 'break' ? 'longBreakInterval' : 'microbreakInterval')
  }

  remaining (type, settings) {
    this.commit()
    return Math.max(0, this.interval(type, settings) - this.elapsed[type])
  }

  complete (type) {
    this.elapsed.microbreak = 0
    if (type === 'break') this.elapsed.break = 0
  }

  defer (type, delay, settings) {
    this.commit()
    this.elapsed[type] = this.interval(type, settings) - delay
  }

  reset () {
    this.startedAt = null
    this.elapsed = { microbreak: 0, break: 0 }
  }
}
