/**
 * Unit tests for pomodoro-types.ts pure utility functions
 */

import { PomodoroPhase } from '../enums'
import { POMODORO_DEFAULTS } from '../constants'
import {
  getBreakType,
  getBreakDurationMinutes,
  computeRemainingSeconds,
  phaseDurationToSeconds,
  isTimerExpired,
  getPhaseDurationMinutes,
  createInitialTimerState,
  formatPomodoroTime,
  createPomodoroCycle,
  fromDatabasePomodoroCycle,
  fromDatabasePomodoroSettings,
  projectPomodoroDuration,
  describePomodoroProjection,
  DEFAULT_POMODORO_SETTINGS,
} from '../pomodoro-types'
import type { PomodoroCycle, PomodoroProjectionSettings } from '../pomodoro-types'

describe('pomodoro-types', () => {
  // =========================================================================
  // getBreakType
  // =========================================================================

  describe('getBreakType', () => {
    it('returns ShortBreak for cycle 1 with default settings', () => {
      expect(getBreakType(1, 4)).toBe(PomodoroPhase.ShortBreak)
    })

    it('returns ShortBreak for cycle 2', () => {
      expect(getBreakType(2, 4)).toBe(PomodoroPhase.ShortBreak)
    })

    it('returns ShortBreak for cycle 3', () => {
      expect(getBreakType(3, 4)).toBe(PomodoroPhase.ShortBreak)
    })

    it('returns LongBreak for cycle 4 (every 4th)', () => {
      expect(getBreakType(4, 4)).toBe(PomodoroPhase.LongBreak)
    })

    it('returns ShortBreak for cycle 5 (resets after long break)', () => {
      expect(getBreakType(5, 4)).toBe(PomodoroPhase.ShortBreak)
    })

    it('returns LongBreak for cycle 8 (second long break)', () => {
      expect(getBreakType(8, 4)).toBe(PomodoroPhase.LongBreak)
    })

    it('returns LongBreak every 2 cycles when cyclesBeforeLongBreak=2', () => {
      expect(getBreakType(1, 2)).toBe(PomodoroPhase.ShortBreak)
      expect(getBreakType(2, 2)).toBe(PomodoroPhase.LongBreak)
      expect(getBreakType(3, 2)).toBe(PomodoroPhase.ShortBreak)
      expect(getBreakType(4, 2)).toBe(PomodoroPhase.LongBreak)
    })

    it('handles cyclesBeforeLongBreak=1 (every cycle is long break)', () => {
      expect(getBreakType(1, 1)).toBe(PomodoroPhase.LongBreak)
      expect(getBreakType(2, 1)).toBe(PomodoroPhase.LongBreak)
    })

    it('handles cyclesBeforeLongBreak=0 (always short break)', () => {
      expect(getBreakType(1, 0)).toBe(PomodoroPhase.ShortBreak)
      expect(getBreakType(4, 0)).toBe(PomodoroPhase.ShortBreak)
    })

    it('handles cycle 0 (edge case — guard returns ShortBreak)', () => {
      expect(getBreakType(0, 4)).toBe(PomodoroPhase.ShortBreak)
    })
  })

  // =========================================================================
  // getBreakDurationMinutes
  // =========================================================================

  describe('getBreakDurationMinutes', () => {
    const settings = {
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      cyclesBeforeLongBreak: 4,
    }

    it('returns short break duration for non-multiple cycles', () => {
      expect(getBreakDurationMinutes(1, settings)).toBe(5)
      expect(getBreakDurationMinutes(2, settings)).toBe(5)
      expect(getBreakDurationMinutes(3, settings)).toBe(5)
    })

    it('returns long break duration for multiple cycles', () => {
      expect(getBreakDurationMinutes(4, settings)).toBe(15)
      expect(getBreakDurationMinutes(8, settings)).toBe(15)
    })

    it('uses custom durations', () => {
      const custom = {
        shortBreakMinutes: 10,
        longBreakMinutes: 30,
        cyclesBeforeLongBreak: 3,
      }
      expect(getBreakDurationMinutes(1, custom)).toBe(10)
      expect(getBreakDurationMinutes(3, custom)).toBe(30)
    })
  })

  // =========================================================================
  // computeRemainingSeconds
  // =========================================================================

  describe('computeRemainingSeconds', () => {
    it('returns full duration when just started', () => {
      const now = new Date('2024-01-01T10:00:00Z')
      const result = computeRemainingSeconds(now, 25, now)
      expect(result).toBe(25 * 60) // 1500 seconds
    })

    it('returns correct remaining after 10 minutes', () => {
      const start = new Date('2024-01-01T10:00:00Z')
      const now = new Date('2024-01-01T10:10:00Z')
      const result = computeRemainingSeconds(start, 25, now)
      expect(result).toBe(15 * 60) // 900 seconds
    })

    it('returns 0 when timer has expired', () => {
      const start = new Date('2024-01-01T10:00:00Z')
      const now = new Date('2024-01-01T10:30:00Z')
      const result = computeRemainingSeconds(start, 25, now)
      expect(result).toBe(0)
    })

    it('returns 0 when exactly at expiry', () => {
      const start = new Date('2024-01-01T10:00:00Z')
      const now = new Date('2024-01-01T10:25:00Z')
      const result = computeRemainingSeconds(start, 25, now)
      expect(result).toBe(0)
    })

    it('never returns negative values', () => {
      const start = new Date('2024-01-01T10:00:00Z')
      const now = new Date('2024-01-01T11:00:00Z') // 1 hour later
      const result = computeRemainingSeconds(start, 25, now)
      expect(result).toBe(0)
    })

    it('handles sub-second precision (rounds up)', () => {
      const start = new Date('2024-01-01T10:00:00Z')
      const now = new Date('2024-01-01T10:24:59.500Z') // 0.5s left
      const result = computeRemainingSeconds(start, 25, now)
      expect(result).toBe(1) // ceil(0.5) = 1
    })

    it('works with 5-minute break duration', () => {
      const start = new Date('2024-01-01T10:00:00Z')
      const now = new Date('2024-01-01T10:03:00Z')
      const result = computeRemainingSeconds(start, 5, now)
      expect(result).toBe(2 * 60) // 120 seconds
    })
  })

  // =========================================================================
  // phaseDurationToSeconds
  // =========================================================================

  describe('phaseDurationToSeconds', () => {
    it('converts minutes to seconds', () => {
      expect(phaseDurationToSeconds(25)).toBe(1500)
      expect(phaseDurationToSeconds(5)).toBe(300)
      expect(phaseDurationToSeconds(15)).toBe(900)
    })

    it('handles 0 minutes', () => {
      expect(phaseDurationToSeconds(0)).toBe(0)
    })

    it('handles 1 minute', () => {
      expect(phaseDurationToSeconds(1)).toBe(60)
    })
  })

  // =========================================================================
  // isTimerExpired
  // =========================================================================

  describe('isTimerExpired', () => {
    it('returns false when timer is active', () => {
      const start = new Date('2024-01-01T10:00:00Z')
      const now = new Date('2024-01-01T10:10:00Z')
      expect(isTimerExpired(start, 25, now)).toBe(false)
    })

    it('returns true when timer has expired', () => {
      const start = new Date('2024-01-01T10:00:00Z')
      const now = new Date('2024-01-01T10:30:00Z')
      expect(isTimerExpired(start, 25, now)).toBe(true)
    })

    it('returns true at exactly the expiry time', () => {
      const start = new Date('2024-01-01T10:00:00Z')
      const now = new Date('2024-01-01T10:25:00Z')
      expect(isTimerExpired(start, 25, now)).toBe(true)
    })
  })

  // =========================================================================
  // getPhaseDurationMinutes
  // =========================================================================

  describe('getPhaseDurationMinutes', () => {
    function createMockCycle(overrides: Partial<PomodoroCycle> = {}): PomodoroCycle {
      return {
        id: 'cycle-1',
        sessionId: 'session-1',
        cycleNumber: 1,
        status: PomodoroPhase.Work,
        workDurationMinutes: 25,
        breakDurationMinutes: 5,
        phaseStartTime: new Date('2024-01-01T10:00:00Z'),
        startTime: new Date('2024-01-01T10:00:00Z'),
        endTime: null,
        breakTimeSinkId: null,
        createdAt: new Date('2024-01-01T10:00:00Z'),
        ...overrides,
      }
    }

    it('returns work duration for Work phase', () => {
      const cycle = createMockCycle({ status: PomodoroPhase.Work })
      expect(getPhaseDurationMinutes(cycle)).toBe(25)
    })

    it('returns break duration for ShortBreak phase', () => {
      const cycle = createMockCycle({ status: PomodoroPhase.ShortBreak })
      expect(getPhaseDurationMinutes(cycle)).toBe(5)
    })

    it('returns break duration for LongBreak phase', () => {
      const cycle = createMockCycle({ status: PomodoroPhase.LongBreak, breakDurationMinutes: 15 })
      expect(getPhaseDurationMinutes(cycle)).toBe(15)
    })

    it('returns 0 for Paused phase', () => {
      const cycle = createMockCycle({ status: PomodoroPhase.Paused })
      expect(getPhaseDurationMinutes(cycle)).toBe(0)
    })

    it('returns 0 for Completed phase', () => {
      const cycle = createMockCycle({ status: PomodoroPhase.Completed })
      expect(getPhaseDurationMinutes(cycle)).toBe(0)
    })
  })

  // =========================================================================
  // createInitialTimerState
  // =========================================================================

  describe('createInitialTimerState', () => {
    it('returns inactive state with all fields zeroed/null', () => {
      const state = createInitialTimerState()
      expect(state.isActive).toBe(false)
      expect(state.currentPhase).toBe(PomodoroPhase.Completed)
      expect(state.currentCycleId).toBeNull()
      expect(state.cycleNumber).toBe(0)
      expect(state.remainingSeconds).toBe(0)
      expect(state.totalSeconds).toBe(0)
      expect(state.currentTaskId).toBeNull()
      expect(state.currentTaskName).toBeNull()
    })
  })

  // =========================================================================
  // formatPomodoroTime
  // =========================================================================

  describe('formatPomodoroTime', () => {
    it('formats 25 minutes as 25:00', () => {
      expect(formatPomodoroTime(1500)).toBe('25:00')
    })

    it('formats 5 minutes as 05:00', () => {
      expect(formatPomodoroTime(300)).toBe('05:00')
    })

    it('formats 0 seconds as 00:00', () => {
      expect(formatPomodoroTime(0)).toBe('00:00')
    })

    it('formats 90 seconds as 01:30', () => {
      expect(formatPomodoroTime(90)).toBe('01:30')
    })

    it('formats 59 seconds as 00:59', () => {
      expect(formatPomodoroTime(59)).toBe('00:59')
    })

    it('formats 61 seconds as 01:01', () => {
      expect(formatPomodoroTime(61)).toBe('01:01')
    })
  })

  // =========================================================================
  // createPomodoroCycle
  // =========================================================================

  describe('createPomodoroCycle', () => {
    it('creates a cycle with correct defaults', () => {
      const now = new Date('2024-01-01T10:00:00Z')
      const cycle = createPomodoroCycle({
        sessionId: 'session-1',
        cycleNumber: 1,
        workDurationMinutes: 25,
        breakDurationMinutes: 5,
        startTime: now,
      })

      expect(cycle.id).toMatch(/^cycle-/)
      expect(cycle.sessionId).toBe('session-1')
      expect(cycle.cycleNumber).toBe(1)
      expect(cycle.status).toBe(PomodoroPhase.Work)
      expect(cycle.workDurationMinutes).toBe(25)
      expect(cycle.breakDurationMinutes).toBe(5)
      expect(cycle.phaseStartTime).toBe(now)
      expect(cycle.startTime).toBe(now)
      expect(cycle.endTime).toBeNull()
      expect(cycle.breakTimeSinkId).toBeNull()
    })
  })

  // =========================================================================
  // fromDatabasePomodoroCycle
  // =========================================================================

  describe('fromDatabasePomodoroCycle', () => {
    it('converts a database record to domain type', () => {
      const record = {
        id: 'cycle-1',
        sessionId: 'session-1',
        cycleNumber: 2,
        status: 'short_break',
        workDurationMinutes: 25,
        breakDurationMinutes: 5,
        phaseStartTime: '2024-01-01T10:25:00Z',
        startTime: '2024-01-01T10:00:00Z',
        endTime: null,
        breakTimeSinkId: 'sink-coffee',
        createdAt: '2024-01-01T10:00:00Z',
      }

      const cycle = fromDatabasePomodoroCycle(record)

      expect(cycle.id).toBe('cycle-1')
      expect(cycle.status).toBe(PomodoroPhase.ShortBreak)
      expect(cycle.phaseStartTime).toBeInstanceOf(Date)
      expect(cycle.startTime).toBeInstanceOf(Date)
      expect(cycle.endTime).toBeNull()
      expect(cycle.breakTimeSinkId).toBe('sink-coffee')
    })

    it('handles endTime when present', () => {
      const record = {
        id: 'cycle-1',
        sessionId: 'session-1',
        cycleNumber: 1,
        status: 'completed',
        workDurationMinutes: 25,
        breakDurationMinutes: 5,
        phaseStartTime: '2024-01-01T10:25:00Z',
        startTime: '2024-01-01T10:00:00Z',
        endTime: '2024-01-01T10:30:00Z',
        breakTimeSinkId: null,
        createdAt: '2024-01-01T10:00:00Z',
      }

      const cycle = fromDatabasePomodoroCycle(record)
      expect(cycle.endTime).toBeInstanceOf(Date)
      expect(cycle.endTime?.toISOString()).toBe('2024-01-01T10:30:00.000Z')
    })
  })

  // =========================================================================
  // fromDatabasePomodoroSettings
  // =========================================================================

  describe('fromDatabasePomodoroSettings', () => {
    it('converts a database record to domain type', () => {
      const record = {
        id: 'settings-1',
        sessionId: 'session-1',
        workDurationMinutes: 30,
        shortBreakMinutes: 10,
        longBreakMinutes: 20,
        cyclesBeforeLongBreak: 3,
        autoStartBreak: false,
        autoStartWork: true,
        idleReminderMinutes: 5,
        soundEnabled: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      }

      const settings = fromDatabasePomodoroSettings(record)

      expect(settings.workDurationMinutes).toBe(30)
      expect(settings.shortBreakMinutes).toBe(10)
      expect(settings.longBreakMinutes).toBe(20)
      expect(settings.cyclesBeforeLongBreak).toBe(3)
      expect(settings.autoStartBreak).toBe(false)
      expect(settings.autoStartWork).toBe(true)
      expect(settings.idleReminderMinutes).toBe(5)
      expect(settings.soundEnabled).toBe(false)
      expect(settings.createdAt).toBeInstanceOf(Date)
      expect(settings.updatedAt).toBeInstanceOf(Date)
    })

    it('handles null idleReminderMinutes', () => {
      const record = {
        id: 'settings-1',
        sessionId: 'session-1',
        workDurationMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
        cyclesBeforeLongBreak: 4,
        autoStartBreak: true,
        autoStartWork: false,
        idleReminderMinutes: null,
        soundEnabled: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      const settings = fromDatabasePomodoroSettings(record)
      expect(settings.idleReminderMinutes).toBeNull()
    })
  })

  // =========================================================================
  // DEFAULT_POMODORO_SETTINGS
  // =========================================================================

  describe('DEFAULT_POMODORO_SETTINGS', () => {
    it('matches POMODORO_DEFAULTS constants', () => {
      expect(DEFAULT_POMODORO_SETTINGS.workDurationMinutes).toBe(POMODORO_DEFAULTS.WORK_DURATION_MINUTES)
      expect(DEFAULT_POMODORO_SETTINGS.shortBreakMinutes).toBe(POMODORO_DEFAULTS.SHORT_BREAK_MINUTES)
      expect(DEFAULT_POMODORO_SETTINGS.longBreakMinutes).toBe(POMODORO_DEFAULTS.LONG_BREAK_MINUTES)
      expect(DEFAULT_POMODORO_SETTINGS.cyclesBeforeLongBreak).toBe(POMODORO_DEFAULTS.CYCLES_BEFORE_LONG_BREAK)
    })

    it('has sensible default values for behavioral settings', () => {
      expect(DEFAULT_POMODORO_SETTINGS.autoStartBreak).toBe(true)
      expect(DEFAULT_POMODORO_SETTINGS.autoStartWork).toBe(false)
      expect(DEFAULT_POMODORO_SETTINGS.idleReminderMinutes).toBeNull()
      expect(DEFAULT_POMODORO_SETTINGS.soundEnabled).toBe(true)
    })
  })

  // =========================================================================
  // projectPomodoroDuration
  // =========================================================================

  describe('projectPomodoroDuration', () => {
    const referenceSettings: PomodoroProjectionSettings = {
      workDurationMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 30,
      cyclesBeforeLongBreak: 4,
    }

    it('matches the reference example: 240m at 25/5/30 every 4 cycles → 9.6 cycles, 348m total', () => {
      const projection = projectPomodoroDuration(240, referenceSettings)
      expect(projection.workMinutes).toBe(240)
      expect(projection.cycleCount).toBe(9.6)
      expect(projection.completedCycles).toBe(9)
      expect(projection.longBreakCount).toBe(2) // floor(9.6 / 4)
      expect(projection.shortBreakTotalMinutes).toBe(48) // 9.6 * 5
      expect(projection.longBreakTotalMinutes).toBe(60) // 2 * 30
      expect(projection.breakMinutes).toBe(108)
      expect(projection.totalMinutes).toBe(348)
    })

    it('satisfies the closed-form formula N*(X+Y) + Z*floor(N/C) for assorted inputs', () => {
      const cases: Array<{ workMinutes: number; settings: PomodoroProjectionSettings }> = [
        { workMinutes: 240, settings: referenceSettings },
        { workMinutes: 90, settings: { workDurationMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 20, cyclesBeforeLongBreak: 2 } },
        { workMinutes: 130, settings: { workDurationMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 4 } },
      ]
      for (const { workMinutes, settings } of cases) {
        const projection = projectPomodoroDuration(workMinutes, settings)
        const n = workMinutes / settings.workDurationMinutes
        const expected =
          n * (settings.workDurationMinutes + settings.shortBreakMinutes) +
          settings.longBreakMinutes * Math.floor(n / settings.cyclesBeforeLongBreak)
        expect(projection.totalMinutes).toBeCloseTo(expected, 10)
        expect(projection.workMinutes).toBe(workMinutes)
      }
    })

    it('includes the trailing rest when cycles divide exactly into the long-break boundary', () => {
      // 100m / 25m = exactly 4 cycles → the 4th cycle's short rest AND the earned long break both count
      const projection = projectPomodoroDuration(100, referenceSettings)
      expect(projection.cycleCount).toBe(4)
      expect(projection.completedCycles).toBe(4)
      expect(projection.longBreakCount).toBe(1)
      expect(projection.shortBreakTotalMinutes).toBe(20)
      expect(projection.longBreakTotalMinutes).toBe(30)
      expect(projection.totalMinutes).toBe(150) // 4 * (25 + 5) + 30
    })

    it('includes trailing short rest on an exact multiple below the long-break boundary', () => {
      const projection = projectPomodoroDuration(75, referenceSettings)
      expect(projection.cycleCount).toBe(3)
      expect(projection.longBreakCount).toBe(0)
      expect(projection.totalMinutes).toBe(90) // 3 * (25 + 5)
    })

    it('handles a fractional sub-cycle with proportional rest', () => {
      const projection = projectPomodoroDuration(10, referenceSettings)
      expect(projection.cycleCount).toBe(0.4)
      expect(projection.completedCycles).toBe(0)
      expect(projection.longBreakCount).toBe(0)
      expect(projection.shortBreakTotalMinutes).toBe(2) // 0.4 * 5
      expect(projection.totalMinutes).toBe(12)
    })

    it('respects fully custom settings (never assumes 25/5/30/4)', () => {
      const custom: PomodoroProjectionSettings = {
        workDurationMinutes: 50,
        shortBreakMinutes: 10,
        longBreakMinutes: 20,
        cyclesBeforeLongBreak: 2,
      }
      const projection = projectPomodoroDuration(200, custom)
      expect(projection.cycleCount).toBe(4)
      expect(projection.longBreakCount).toBe(2)
      expect(projection.shortBreakTotalMinutes).toBe(40)
      expect(projection.longBreakTotalMinutes).toBe(40)
      expect(projection.totalMinutes).toBe(280)
    })

    it('returns an all-zero projection for zero work', () => {
      const projection = projectPomodoroDuration(0, referenceSettings)
      expect(projection).toEqual({
        workMinutes: 0,
        cycleCount: 0,
        completedCycles: 0,
        longBreakCount: 0,
        shortBreakTotalMinutes: 0,
        longBreakTotalMinutes: 0,
        breakMinutes: 0,
        totalMinutes: 0,
      })
    })

    it('returns an all-zero projection for negative work', () => {
      const projection = projectPomodoroDuration(-30, referenceSettings)
      expect(projection.totalMinutes).toBe(0)
      expect(projection.workMinutes).toBe(0)
    })

    it('adds no rest when workDurationMinutes is invalid (<= 0)', () => {
      const projection = projectPomodoroDuration(120, { ...referenceSettings, workDurationMinutes: 0 })
      expect(projection.workMinutes).toBe(120)
      expect(projection.cycleCount).toBe(0)
      expect(projection.breakMinutes).toBe(0)
      expect(projection.totalMinutes).toBe(120)
    })

    it('never adds long breaks when cyclesBeforeLongBreak <= 0 (mirrors getBreakType guard)', () => {
      const projection = projectPomodoroDuration(200, { ...referenceSettings, cyclesBeforeLongBreak: 0 })
      expect(projection.cycleCount).toBe(8)
      expect(projection.longBreakCount).toBe(0)
      expect(projection.totalMinutes).toBe(240) // 200 + 8 * 5
    })

    it('treats negative break durations as zero rest', () => {
      const projection = projectPomodoroDuration(100, {
        ...referenceSettings,
        shortBreakMinutes: -5,
        longBreakMinutes: -10,
      })
      expect(projection.shortBreakTotalMinutes).toBe(0)
      expect(projection.longBreakTotalMinutes).toBe(0)
      expect(projection.totalMinutes).toBe(100)
    })

    it('works with the user-configurable defaults (no values hardcoded in the utility)', () => {
      const projection = projectPomodoroDuration(240, DEFAULT_POMODORO_SETTINGS)
      // 25/5/15/4 defaults: 9.6 cycles, 2 long breaks of 15
      expect(projection.cycleCount).toBe(9.6)
      expect(projection.totalMinutes).toBe(318) // 240 + 48 + 30
    })
  })

  // =========================================================================
  // describePomodoroProjection
  // =========================================================================

  describe('describePomodoroProjection', () => {
    const referenceSettings: PomodoroProjectionSettings = {
      workDurationMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 30,
      cyclesBeforeLongBreak: 4,
    }

    it('describes the reference example as 4h ≈ 5h 48m', () => {
      expect(describePomodoroProjection(240, referenceSettings)).toBe(
        '4h of work ≈ 5h 48m with your pomodoro settings',
      )
    })

    it('rounds fractional totals to whole minutes for display', () => {
      // 20m / 25m = 0.8 cycles → 0.8 * 7 = 5.6m rest → 25.6m total → rounds to 26m
      expect(
        describePomodoroProjection(20, { ...referenceSettings, shortBreakMinutes: 7 }),
      ).toBe('20m of work ≈ 26m with your pomodoro settings')
    })

    it('degrades gracefully for zero work', () => {
      expect(describePomodoroProjection(0, referenceSettings)).toBe(
        '0m of work ≈ 0m with your pomodoro settings',
      )
    })
  })
})
