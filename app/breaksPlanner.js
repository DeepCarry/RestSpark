import Scheduler from './utils/scheduler.js'
import WorkSchedule from './utils/workSchedule.js'
import EventEmitter from 'events'
import NaturalBreaksManager from './utils/naturalBreaksManager.js'
import DndManager from './utils/dndManager.js'
import AppExclusionsManager from './utils/appExclusionsManager.js'

class BreaksPlanner extends EventEmitter {
  constructor (settings) {
    super()
    this.settings = settings
    this.breakNumber = 0
    this.postponesNumber = 0
    this.scheduler = new Scheduler(() => {}, 0)
    this.manualPauseUntil = 0
    this.indefinitelyPaused = false
    this.manualPauseTimer = null
    this.powerBlocks = new Set()
    this.manualBreak = false
    this.workSchedule = new WorkSchedule()
    this.scheduledType = 'microbreak'
    this.startingType = null
    this.naturalBreaksManager = new NaturalBreaksManager(settings)
    this.dndManager = new DndManager(settings)
    this.appExclusionsManager = new AppExclusionsManager(settings)

    this.on('microbreakStarted', (shouldPlaySound, started = Date.now(), duration = this.settings.get('microbreakDuration')) => {
      this.startingType = null
      this.workSchedule.stop()
      this.scheduledType = 'microbreak'
      const interval = Math.max(0, duration - (Date.now() - started))
      this.scheduler = new Scheduler(() => this.emit('finishMicrobreak', shouldPlaySound, true), interval, 'finishMicrobreak')
      this.scheduler.plan()
    })

    this.on('breakStarted', (shouldPlaySound, started = Date.now(), duration = this.settings.get('breakDuration')) => {
      this.startingType = null
      this.workSchedule.stop()
      this.scheduledType = 'break'
      const interval = Math.max(0, duration - (Date.now() - started))
      this.scheduler = new Scheduler(() => this.emit('finishBreak', shouldPlaySound, true), interval, 'finishBreak')
      this.scheduler.plan()
    })

    this.naturalBreaksManager.on('clearBreakScheduler', () => this.reconcileProtection())
    this.naturalBreaksManager.on('naturalBreakFinished', () => this.reconcileProtection())
    this.dndManager.on('dndStarted', () => this.reconcileProtection('focus'))
    this.dndManager.on('dndFinished', () => this.reconcileProtection())
    this.dndManager.on('statusChanged', () => this.emit('updateToolTip'))
    this.appExclusionsManager.on('appExclusionStarted', rule => this.reconcileProtection(rule === 'pause' ? 'exclusion' : null))
    this.appExclusionsManager.on('appExclusionFinished', () => this.reconcileProtection())
    this.restoreManualPause()
  }

  get isPaused () {
    return this.indefinitelyPaused || this.manualPauseUntil > 0
  }

  get autoBlocked () {
    return this.isPaused || this.powerBlocks.size > 0 || this.dndManager.isOnDnd ||
      this.naturalBreaksManager.isSchedulerCleared || this.appExclusionsManager.isSchedulerCleared
  }

  get breakInProgress () {
    return Boolean(this.startingType || this.scheduler.reference?.startsWith('finish'))
  }

  reconcileProtection (cause) {
    if (this.autoBlocked) {
      if (this.breakInProgress) {
        if (cause === 'power' || cause === 'exclusion' || (cause === 'focus' && !this.manualBreak)) {
          this.emit('interruptBreak')
          this.clear()
        }
      } else if (!this.manualBreak || this.powerBlocks.size > 0) {
        this.clear()
      }
    } else if (!this.scheduler.reference) {
      this.planNextWorkBreak()
    }
    this.emit('updateToolTip')
  }

  setPowerBlock (reason, blocked) {
    if (blocked) this.powerBlocks.add(reason)
    else this.powerBlocks.delete(reason)
    this.reconcileProtection(blocked ? 'power' : null)
  }

  nextBreak () {
    const completed = this.startingType
      ? `finish${this.startingType.charAt(0).toUpperCase() + this.startingType.slice(1)}`
      : this.scheduler?.reference
    this.startingType = null
    this.manualBreak = false
    if (completed === 'finishMicrobreak') this.workSchedule.complete('microbreak')
    if (completed === 'finishBreak') this.workSchedule.complete('break')
    this.postponesNumber = 0
    this.breakNumber += 1
    this.planNextWorkBreak()
  }

  planNextWorkBreak () {
    this.scheduler?.cancel()
    if (this.autoBlocked) {
      this.workSchedule.stop()
      return
    }
    this.workSchedule.start(this.settings)
    const mini = this.settings.get('microbreak') ? this.workSchedule.remaining('microbreak', this.settings) : Infinity
    const long = this.settings.get('break') ? this.workSchedule.remaining('break', this.settings) : Infinity
    if (mini === Infinity && long === Infinity) {
      this.workSchedule.stop()
      this.scheduler = new Scheduler(() => {}, 0)
      return
    }
    if (this.scheduledType === 'break' && this.postponesNumber > 0 && long !== Infinity) {
      this.scheduleWait('break', long)
      return
    }
    const type = long <= mini ? 'break' : 'microbreak'
    if (this.scheduledType !== type) this.postponesNumber = 0
    this.scheduleWait(type, Math.min(mini, long))
  }

  scheduleWait (type, delay, notify = true) {
    this.previewHandled = false
    this.scheduledType = type
    this.pendingStartAt = Date.now() + delay
    const lead = Math.min(delay, Math.max(0, Number(this.settings.get(`${type}NotificationInterval`)) || 0))
    this.notificationLead = lead
    const notification = notify && this.settings.get(`${type}Notification`) && delay > 0 && lead > 0
    const name = `start${type.charAt(0).toUpperCase() + type.slice(1)}${notification ? 'Notification' : ''}`
    const fire = () => {
      if (this.scheduler !== pending || pending.reference === null) return
      if (this.powerBlocks.size > 0 || (this.autoBlocked && !this.manualBreak)) {
        this.reconcileProtection()
        return
      }
      if (!notification) {
        this.startingType = type
        this.workSchedule.stop()
      }
      this.emit(name)
    }
    const pending = new Scheduler(() => {
      if (!this.manualBreak && process.platform === 'darwin' && this.dndManager.monitorDnd) {
        this.dndManager.refresh().then(fire)
      } else {
        fire()
      }
    }, Math.max(0, delay - (notification ? lead : 0)), name)
    this.scheduler = pending
    pending.plan()
  }

  nextBreakAfterNotification () {
    this.scheduler.cancel()
    const remaining = Math.max(0, this.pendingStartAt - Date.now())
    this.scheduleWait(this.scheduledType, remaining, false)
    this.previewHandled = true
  }

  updateNotificationSchedule (type) {
    if (this.scheduledType !== type || this.autoBlocked || this.breakInProgress || this.manualBreak ||
        this.previewHandled || !this.scheduler.reference?.startsWith('start')) return
    this.scheduler.cancel()
    this.scheduleWait(type, Math.max(0, this.pendingStartAt - Date.now()))
  }

  postponeCurrentBreak () {
    this.startingType = null
    this.scheduler.cancel()
    this.postponesNumber += 1
    const type = this.scheduledType
    const delay = this.settings.get(`${type}PostponeTime`)
    if (this.autoBlocked) {
      this.clear()
      this.emit('updateToolTip')
      return
    }
    this.manualBreak = false
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
    this.manualBreak = true
    this.scheduleWait('microbreak', delay, false)
    this.emit('updateToolTip')
  }

  skipToBreak (delay = 100) {
    this.startingType = null
    this.scheduler?.cancel()
    this.postponesNumber = 0
    this.workSchedule.start(this.settings)
    this.manualBreak = true
    this.scheduleWait('break', delay, false)
    this.emit('updateToolTip')
  }

  replan () {
    if (this.autoBlocked || this.breakInProgress || this.manualBreak) return
    this.planNextWorkBreak()
  }

  get timeToLongBreak () {
    if (!this.settings.get('break')) return null
    return this.workSchedule.remaining('break', this.settings)
  }

  clear () {
    this.manualBreak = false
    this.startingType = null
    this.scheduler?.cancel()
    this.workSchedule.reset()
    this.breakNumber = 0
    this.postponesNumber = 0
  }

  restoreManualPause () {
    const deadline = this.settings.get('manualPauseUntil')
    this.indefinitelyPaused = false
    this.manualPauseUntil = Number.isSafeInteger(deadline) && deadline > Date.now() ? deadline : 0
    if (!this.manualPauseUntil && deadline) this.settings.set('manualPauseUntil', 0)
    this.armManualPause()
  }

  pause (milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return
    const deadline = milliseconds === 1 ? 0 : Math.round(Date.now() + milliseconds)
    if (!Number.isSafeInteger(deadline)) return
    this.settings.set('manualPauseUntil', deadline)
    this.manualPauseUntil = deadline
    this.indefinitelyPaused = milliseconds === 1
    this.clear()
    this.armManualPause()
  }

  armManualPause () {
    clearTimeout(this.manualPauseTimer)
    this.manualPauseTimer = null
    if (!this.manualPauseUntil) return
    // Recheck wall-clock changes and avoid the setTimeout upper limit.
    const delay = Math.min(60000, Math.max(0, this.manualPauseUntil - Date.now()))
    this.manualPauseTimer = setTimeout(() => this.checkManualPause(), delay)
  }

  checkManualPause () {
    if (this.manualPauseUntil && this.manualPauseUntil <= Date.now()) this.resume()
    else this.armManualPause()
  }

  resume () {
    if (!this.isPaused) return
    this.settings.set('manualPauseUntil', 0)
    this.manualPauseUntil = 0
    this.indefinitelyPaused = false
    this.armManualPause()
    this.reconcileProtection()
  }

  correctScheduler () {
    this.checkManualPause()
    if (this.breakInProgress || this.manualBreak) this.scheduler.correct()
    else if (this.scheduler.reference?.startsWith('start')) this.replan()
  }

  reset () {
    this.clear()
    if (this.isPaused) this.resume()
    else this.reconcileProtection()
  }

  get _scheduledBreakType () {
    return this.scheduledType
  }

  naturalBreaks (shouldUse) {
    if (shouldUse) {
      this.naturalBreaksManager.start()
    } else {
      this.naturalBreaksManager.stop()
      this.reconcileProtection()
    }
  }

  doNotDisturb (shouldUse) {
    if (shouldUse) {
      this.dndManager.start()
    } else {
      this.dndManager.stop()
      this.reconcileProtection()
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
