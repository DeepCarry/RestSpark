import Scheduler from './utils/scheduler.js'
import WorkSchedule from './utils/workSchedule.js'
import EventEmitter from 'events'
import NaturalBreaksManager from './utils/naturalBreaksManager.js'
import DndManager from './utils/dndManager.js'
import AppExclusionsManager from './utils/appExclusionsManager.js'
import log from 'electron-log/main.js'

class BreaksPlanner extends EventEmitter {
  constructor (settings) {
    super()
    this.settings = settings
    this.breakNumber = 0
    this.postponesNumber = 0
    this.scheduler = null
    this.isPaused = false
    this.workSchedule = new WorkSchedule()
    this.scheduledType = 'microbreak'
    this.startingType = null
    this.naturalBreaksManager = new NaturalBreaksManager(settings)
    this.dndManager = new DndManager(settings)
    this.appExclusionsManager = new AppExclusionsManager(settings)

    this.on('microbreakStarted', (shouldPlaySound) => {
      this.startingType = null
      this.workSchedule.stop()
      this.scheduledType = 'microbreak'
      const interval = this.settings.get('microbreakDuration')
      this.scheduler = new Scheduler(() => this.emit('finishMicrobreak', shouldPlaySound, true), interval, 'finishMicrobreak')
      this.scheduler.plan()
    })

    this.on('breakStarted', (shouldPlaySound) => {
      this.startingType = null
      this.workSchedule.stop()
      this.scheduledType = 'break'
      const interval = this.settings.get('breakDuration')
      this.scheduler = new Scheduler(() => this.emit('finishBreak', shouldPlaySound, true), interval, 'finishBreak')
      this.scheduler.plan()
    })

    this.naturalBreaksManager.on('clearBreakScheduler', () => {
      if (!this.isPaused && this.scheduler.reference !== 'finishMicrobreak' && this.scheduler.reference !== 'finishBreak' && this.scheduler.reference !== null) {
        this.clear()
        log.info('Stretchly: pausing breaks because of idle time')
      }
    })

    this.naturalBreaksManager.on('naturalBreakFinished', () => {
      if (!this.isPaused && this.scheduler.reference !== 'finishMicrobreak' && this.scheduler.reference !== 'finishBreak' && !this.dndManager.isOnDnd) {
        this.reset()
        log.info('Stretchly: resuming breaks after idle time')
        this.emit('updateToolTip')
      }
    })

    this.dndManager.on('dndStarted', () => {
      if (!this.isPaused && this.scheduler.reference !== 'finishMicrobreak' && this.scheduler.reference !== 'finishBreak' && this.scheduler.reference !== null) {
        this.clear()
        log.info('Stretchly: pausing breaks for Do Not Distrub')
        this.emit('updateToolTip')
      } else {
        this.dndManager.isOnDnd = false
      }
    })

    this.dndManager.on('dndFinished', () => {
      if (!this.isPaused && this.scheduler.reference !== 'finishMicrobreak' && this.scheduler.reference !== 'finishBreak') {
        this.reset()
        log.info('Stretchly: resuming breaks for Do Not Distrub')
        this.emit('updateToolTip')
      }
    })

    this.appExclusionsManager.on('appExclusionStarted', (rule, exclusion) => {
      if (rule === 'pause') {
        if (!this.isPaused && this.scheduler.reference !== 'finishMicrobreak' && this.scheduler.reference !== 'finishBreak' && this.scheduler.reference !== null) {
          this.clear()
          log.info(`Stretchly: pausing breaks as 'pause' exclusion found running: '${exclusion}'`)
          this.emit('updateToolTip')
        } else if (!this.isPaused && this.scheduler.reference === 'finishBreak') {
          this.emit('finishBreak', false, false)
          this.clear()
          log.info(`Stretchly: closing current and pausing breaks as 'pause' exclusion found running: '${exclusion}'`)
          this.emit('updateToolTip')
        } else if (!this.isPaused && this.scheduler.reference === 'finishMicrobreak') {
          this.emit('finishMicrobreak', false, false)
          this.clear()
          log.info(`Stretchly: closing current and pausing breaks as 'pause' exclusion found running: '${exclusion}'`)
          this.emit('updateToolTip')
        } else {
          this.appExclusionsManager.inOnException = false
        }
      } else if (rule === 'resume') {
        if (!this.isPaused && this.scheduler.reference !== 'finishMicrobreak' && this.scheduler.reference !== 'finishBreak') {
          this.reset()
          log.info(`Stretchly: resuming breaks as 'resume' exclusion found running: '${exclusion}'`)
          this.emit('updateToolTip')
        }
      }
    })

    this.appExclusionsManager.on('appExclusionFinished', (rule) => {
      if (rule === 'pause') {
        if (!this.isPaused && this.scheduler.reference !== 'finishMicrobreak' && this.scheduler.reference !== 'finishBreak') {
          this.reset()
          log.info("Stretchly: resuming breaks as no 'pause' exclusion found running")
          this.emit('updateToolTip')
        }
      } else if (rule === 'resume') {
        if (!this.isPaused && this.scheduler.reference !== 'finishMicrobreak' && this.scheduler.reference !== 'finishBreak' && this.scheduler.reference !== null) {
          this.clear()
          log.info("Stretchly: pausing breaks as no 'resume' exclusion found running")
          this.emit('updateToolTip')
        } else {
          this.appExclusionsManager.inOnException = true
        }
      }
    })
  }

  nextBreak () {
    const completed = this.startingType
      ? `finish${this.startingType.charAt(0).toUpperCase() + this.startingType.slice(1)}`
      : this.scheduler?.reference
    this.startingType = null
    if (completed === 'finishMicrobreak') this.workSchedule.complete('microbreak')
    if (completed === 'finishBreak') this.workSchedule.complete('break')
    this.postponesNumber = 0
    this.breakNumber += 1
    this.planNextWorkBreak()
  }

  planNextWorkBreak () {
    this.scheduler?.cancel()
    this.workSchedule.start(this.settings)
    const mini = this.settings.get('microbreak') ? this.workSchedule.remaining('microbreak', this.settings) : Infinity
    const long = this.settings.get('break') ? this.workSchedule.remaining('break', this.settings) : Infinity
    if (mini === Infinity && long === Infinity) {
      this.workSchedule.stop()
      this.scheduler = new Scheduler(() => {}, 0)
      return
    }
    const type = long <= mini ? 'break' : 'microbreak'
    if (this.scheduledType !== type) this.postponesNumber = 0
    this.scheduleWait(type, Math.min(mini, long))
  }

  scheduleWait (type, delay, notify = true) {
    this.scheduledType = type
    this.pendingStartAt = Date.now() + delay
    const lead = Math.min(delay, Math.max(0, Number(this.settings.get(`${type}NotificationInterval`)) || 0))
    this.notificationLead = lead
    const notification = notify && this.settings.get(`${type}Notification`) && delay > 0 && lead > 0
    const name = `start${type.charAt(0).toUpperCase() + type.slice(1)}${notification ? 'Notification' : ''}`
    this.scheduler = new Scheduler(() => {
      if (!notification) {
        this.startingType = type
        this.workSchedule.stop()
      }
      this.emit(name)
    }, Math.max(0, delay - (notification ? lead : 0)), name)
    this.scheduler.plan()
  }

  nextBreakAfterNotification () {
    this.scheduler.cancel()
    const remaining = Math.max(0, this.pendingStartAt - Date.now())
    this.scheduleWait(this.scheduledType, remaining, false)
  }

  postponeCurrentBreak () {
    this.startingType = null
    this.scheduler.cancel()
    this.postponesNumber += 1
    const type = this.scheduledType
    const delay = this.settings.get(`${type}PostponeTime`)
    this.workSchedule.start(this.settings)
    this.workSchedule.defer(type, delay, this.settings)
    // A postponed mini must not push back the independent long deadline.
    if (type === 'microbreak') this.planNextWorkBreak()
    else this.scheduleWait(type, delay)
    this.emit('updateToolTip')
  }

  skipToMicrobreak (delay = 100) {
    if (this.startingType === 'break' || this.scheduler?.reference === 'finishBreak') this.workSchedule.complete('break')
    this.startingType = null
    this.scheduler?.cancel()
    this.postponesNumber = 0
    this.workSchedule.start(this.settings)
    this.scheduleWait('microbreak', delay, false)
    this.emit('updateToolTip')
  }

  skipToBreak (delay = 100) {
    this.startingType = null
    this.scheduler?.cancel()
    this.postponesNumber = 0
    this.workSchedule.start(this.settings)
    this.scheduleWait('break', delay, false)
    this.emit('updateToolTip')
  }

  replan () {
    if (this.isPaused || this.startingType || this.scheduler?.reference?.startsWith('finish') ||
      this.dndManager.isOnDnd || this.naturalBreaksManager.isSchedulerCleared ||
      this.appExclusionsManager.isSchedulerCleared) return
    this.planNextWorkBreak()
  }

  get timeToLongBreak () {
    if (!this.settings.get('break')) return null
    return this.workSchedule.remaining('break', this.settings)
  }

  clear () {
    this.startingType = null
    this.scheduler?.cancel()
    this.workSchedule.reset()
    this.breakNumber = 0
    this.postponesNumber = 0
  }

  pause (milliseconds) {
    this.clear()
    this.isPaused = true
    if (milliseconds !== 1) {
      this.scheduler = new Scheduler(() => this.emit('resumeBreaks'), milliseconds, 'resumeBreaks')
      this.scheduler.plan()
    }
  }

  resume () {
    this.scheduler.cancel()
    this.isPaused = false
    this.appExclusionsManager.reset()
    this.nextBreak()
  }

  correctScheduler () {
    if (this.startingType) return
    if (this.scheduler?.reference?.startsWith('start')) this.replan()
    else if (this.scheduler) this.scheduler.correct()
  }

  reset () {
    this.clear()
    this.resume()
  }

  get _scheduledBreakType () {
    return this.scheduledType
  }

  naturalBreaks (shouldUse) {
    if (shouldUse) {
      this.naturalBreaksManager.start()
    } else {
      this.naturalBreaksManager.stop()
    }
  }

  doNotDisturb (shouldUse) {
    if (shouldUse) {
      this.dndManager.start()
    } else {
      this.dndManager.stop()
      if (!this.isPaused && this.scheduler.reference === null) {
        this.reset()
      }
    }
  }

  get timeToNextBreak () {
    if (!this.scheduler) return null
    if (this.scheduler.reference === 'startMicrobreak' || this.scheduler.reference === 'startBreak') {
      return this.scheduler.timeLeft
    }
    if (this.scheduler.reference === 'startBreakNotification') {
      return this.scheduler.timeLeft + this.notificationLead
    }
    if (this.scheduler.reference === 'startMicrobreakNotification') {
      return this.scheduler.timeLeft + this.notificationLead
    }
    return null
  }

  get _progressInterval () {
    if (!this.scheduler) return null
    const { reference, delay } = this.scheduler

    if (reference === 'startMicrobreak' || reference === 'startBreak') {
      return delay
    }

    if (reference === 'startBreakNotification') {
      return delay + this.notificationLead
    }

    if (reference === 'startMicrobreakNotification') {
      return delay + this.notificationLead
    }

    return null
  }

  get progressPercentage () {
    const total = this._progressInterval
    const remaining = this.timeToNextBreak
    if (total === null || total <= 0 || remaining === null) return 0

    const progress = 1 - (remaining / total)
    return Math.max(0, Math.min(100, Math.round(progress * 100)))
  }
}

export default BreaksPlanner
