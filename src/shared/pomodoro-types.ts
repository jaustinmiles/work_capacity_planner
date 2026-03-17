/**
 * Pomodoro Cycle Types
 *
 * A PomodoroCycle is a grouping concept that overlays the existing WorkSession model.
 * Each cycle contains one or more WorkSessions (one per task worked) and uses
 * TimeSinkSession for break tracking. The countdown timer is derived state —
 * remaining time is computed as (phaseStartTime + duration - now), never stored.
 *
 * Key design decisions:
 * - Cycles are optional — all existing views work without them
 * - Break activities reuse TimeSink (no new break model)
 * - Mid-cycle task switching creates a new WorkSession with the same cycleId
 * - Settings are per-session (user-configurable), with per-cycle overrides
 */

import { PomodoroPhase } from './enums'
import { POMODORO_DEFAULTS } from './constants'
import { generateUniqueId } from './step-id-utils'

// ============================================================================
// Core Interfaces
// ============================================================================

/**
 * User-configurable Pomodoro settings.
 * Session-scoped — each session has its own preferences.
 */
export interface PomodoroSettings {
  id: string
  sessionId: string
  workDurationMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  cyclesBeforeLongBreak: number
  autoStartBreak: boolean
  autoStartWork: boolean
  idleReminderMinutes: number | null
  soundEnabled: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * A single Pomodoro cycle — groups work sessions and a break within one work/break period.
 */
export interface PomodoroCycle {
  id: string
  sessionId: string
  cycleNumber: number
  status: PomodoroPhase
  workDurationMinutes: number
  breakDurationMinutes: number
  phaseStartTime: Date
  startTime: Date
  endTime: Date | null
  breakTimeSinkId: string | null
  createdAt: Date
}

/**
 * Reactive timer state — derived every tick from cycle data + current time.
 * This is what UI components consume.
 */
export interface PomodoroTimerState {
  isActive: boolean
  currentPhase: PomodoroPhase
  currentCycleId: string | null
  cycleNumber: number
  remainingSeconds: number
  totalSeconds: number
  currentTaskId: string | null
  currentTaskName: string | null
}

// ============================================================================
// Input Types
// ============================================================================

/** Input for starting a new Pomodoro cycle */
export interface StartPomodoroCycleInput {
  workDurationMinutes?: number
  breakDurationMinutes?: number
}

/** Input for updating Pomodoro settings */
export interface UpdatePomodoroSettingsInput {
  workDurationMinutes?: number
  shortBreakMinutes?: number
  longBreakMinutes?: number
  cyclesBeforeLongBreak?: number
  autoStartBreak?: boolean
  autoStartWork?: boolean
  idleReminderMinutes?: number | null
  soundEnabled?: boolean
}

// ============================================================================
// Defaults
// ============================================================================

/**
 * Default Pomodoro settings for new sessions.
 * All values are user-configurable — these are initial defaults only.
 */
export const DEFAULT_POMODORO_SETTINGS: Omit<PomodoroSettings, 'id' | 'sessionId' | 'createdAt' | 'updatedAt'> = {
  workDurationMinutes: POMODORO_DEFAULTS.WORK_DURATION_MINUTES,
  shortBreakMinutes: POMODORO_DEFAULTS.SHORT_BREAK_MINUTES,
  longBreakMinutes: POMODORO_DEFAULTS.LONG_BREAK_MINUTES,
  cyclesBeforeLongBreak: POMODORO_DEFAULTS.CYCLES_BEFORE_LONG_BREAK,
  autoStartBreak: true,
  autoStartWork: false,
  idleReminderMinutes: null,
  soundEnabled: true,
}

// ============================================================================
// Pure Utility Functions (tested)
// ============================================================================

/**
 * Determine the break type for a given cycle number.
 * Every Nth cycle (cyclesBeforeLongBreak) gets a long break.
 */
export function getBreakType(cycleNumber: number, cyclesBeforeLongBreak: number): PomodoroPhase {
  if (cyclesBeforeLongBreak <= 0) {
    return PomodoroPhase.ShortBreak
  }
  return cycleNumber > 0 && cycleNumber % cyclesBeforeLongBreak === 0
    ? PomodoroPhase.LongBreak
    : PomodoroPhase.ShortBreak
}

/**
 * Get the break duration in minutes for a given cycle number.
 */
export function getBreakDurationMinutes(
  cycleNumber: number,
  settings: Pick<PomodoroSettings, 'shortBreakMinutes' | 'longBreakMinutes' | 'cyclesBeforeLongBreak'>,
): number {
  const breakType = getBreakType(cycleNumber, settings.cyclesBeforeLongBreak)
  return breakType === PomodoroPhase.LongBreak
    ? settings.longBreakMinutes
    : settings.shortBreakMinutes
}

/**
 * Compute remaining seconds from a phase start time and duration.
 * Returns 0 if the phase has already expired.
 */
export function computeRemainingSeconds(
  phaseStartTime: Date,
  durationMinutes: number,
  now: Date,
): number {
  const elapsedMs = now.getTime() - phaseStartTime.getTime()
  const totalMs = durationMinutes * 60 * 1000
  return Math.max(0, Math.ceil((totalMs - elapsedMs) / 1000))
}

/**
 * Compute the total seconds for a phase duration.
 */
export function phaseDurationToSeconds(durationMinutes: number): number {
  return durationMinutes * 60
}

/**
 * Check if a timer has expired (remaining seconds is 0).
 */
export function isTimerExpired(phaseStartTime: Date, durationMinutes: number, now: Date): boolean {
  return computeRemainingSeconds(phaseStartTime, durationMinutes, now) === 0
}

/**
 * Get the duration in minutes for the current phase of a cycle.
 */
export function getPhaseDurationMinutes(cycle: PomodoroCycle): number {
  switch (cycle.status) {
    case PomodoroPhase.Work:
      return cycle.workDurationMinutes
    case PomodoroPhase.ShortBreak:
    case PomodoroPhase.LongBreak:
      return cycle.breakDurationMinutes
    case PomodoroPhase.Paused:
    case PomodoroPhase.Completed:
      return 0
  }
}

/**
 * Create an initial (inactive) timer state.
 */
export function createInitialTimerState(): PomodoroTimerState {
  return {
    isActive: false,
    currentPhase: PomodoroPhase.Completed,
    currentCycleId: null,
    cycleNumber: 0,
    remainingSeconds: 0,
    totalSeconds: 0,
    currentTaskId: null,
    currentTaskName: null,
  }
}

/**
 * Format remaining seconds as mm:ss string.
 */
export function formatPomodoroTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new PomodoroCycle object (for client-side use before persistence).
 */
export function createPomodoroCycle(params: {
  sessionId: string
  cycleNumber: number
  workDurationMinutes: number
  breakDurationMinutes: number
  startTime: Date
}): PomodoroCycle {
  return {
    id: generateUniqueId('cycle'),
    sessionId: params.sessionId,
    cycleNumber: params.cycleNumber,
    status: PomodoroPhase.Work,
    workDurationMinutes: params.workDurationMinutes,
    breakDurationMinutes: params.breakDurationMinutes,
    phaseStartTime: params.startTime,
    startTime: params.startTime,
    endTime: null,
    breakTimeSinkId: null,
    createdAt: params.startTime,
  }
}

// ============================================================================
// Conversion Functions (Database ↔ Domain)
// ============================================================================

/**
 * Convert a database PomodoroCycle record to the domain type.
 */
export function fromDatabasePomodoroCycle(record: Record<string, unknown>): PomodoroCycle {
  return {
    id: record.id as string,
    sessionId: record.sessionId as string,
    cycleNumber: record.cycleNumber as number,
    status: record.status as PomodoroPhase,
    workDurationMinutes: record.workDurationMinutes as number,
    breakDurationMinutes: record.breakDurationMinutes as number,
    phaseStartTime: new Date(record.phaseStartTime as string | Date),
    startTime: new Date(record.startTime as string | Date),
    endTime: record.endTime ? new Date(record.endTime as string | Date) : null,
    breakTimeSinkId: (record.breakTimeSinkId as string) ?? null,
    createdAt: new Date(record.createdAt as string | Date),
  }
}

/**
 * Convert a database PomodoroSettings record to the domain type.
 */
export function fromDatabasePomodoroSettings(record: Record<string, unknown>): PomodoroSettings {
  return {
    id: record.id as string,
    sessionId: record.sessionId as string,
    workDurationMinutes: record.workDurationMinutes as number,
    shortBreakMinutes: record.shortBreakMinutes as number,
    longBreakMinutes: record.longBreakMinutes as number,
    cyclesBeforeLongBreak: record.cyclesBeforeLongBreak as number,
    autoStartBreak: record.autoStartBreak as boolean,
    autoStartWork: record.autoStartWork as boolean,
    idleReminderMinutes: (record.idleReminderMinutes as number) ?? null,
    soundEnabled: record.soundEnabled as boolean,
    createdAt: new Date(record.createdAt as string | Date),
    updatedAt: new Date(record.updatedAt as string | Date),
  }
}
