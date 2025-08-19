import { describe, it, expect } from 'vitest'
import {
  timeToMinutes,
  minutesToTime,
  roundToQuarter,
  getTypeColor,
  checkOverlap,
  getClockPosition,
  generateArcPath,
  angleToMinutes,
  findClosestEdge,
} from '../SessionState'
import { TaskType } from '@shared/enums'
import type { WorkSessionData } from '../SessionState'

describe('SessionState utilities', () => {
  describe('timeToMinutes', () => {
    it('converts time string to minutes since midnight', () => {
      expect(timeToMinutes('00:00')).toBe(0)
      expect(timeToMinutes('09:30')).toBe(570)
      expect(timeToMinutes('12:00')).toBe(720)
      expect(timeToMinutes('23:59')).toBe(1439)
    })
  })

  describe('minutesToTime', () => {
    it('converts minutes to time string', () => {
      expect(minutesToTime(0)).toBe('00:00')
      expect(minutesToTime(570)).toBe('09:30')
      expect(minutesToTime(720)).toBe('12:00')
      expect(minutesToTime(1439)).toBe('23:59')
    })
  })

  describe('roundToQuarter', () => {
    it('rounds minutes to nearest 15-minute increment', () => {
      expect(roundToQuarter(0)).toBe(0)
      expect(roundToQuarter(7)).toBe(0)
      expect(roundToQuarter(8)).toBe(15)
      expect(roundToQuarter(22)).toBe(15)
      expect(roundToQuarter(23)).toBe(30)
      expect(roundToQuarter(567)).toBe(570) // 9:27 -> 9:30
    })
  })

  describe('getTypeColor', () => {
    it('returns correct color for task type', () => {
      expect(getTypeColor(TaskType.Focused)).toBe('#165DFF')
      expect(getTypeColor(TaskType.Admin)).toBe('#00B42A')
    })
  })

  describe('checkOverlap', () => {
    const sessions: WorkSessionData[] = [
      {
        id: 'session-1',
        taskId: 'task-1',
        taskName: 'Task 1',
        startMinutes: 540, // 9:00
        endMinutes: 600, // 10:00
        type: TaskType.Focused,
        color: '#165DFF',
      },
      {
        id: 'session-2',
        taskId: 'task-2',
        taskName: 'Task 2',
        startMinutes: 660, // 11:00
        endMinutes: 720, // 12:00
        type: TaskType.Admin,
        color: '#00B42A',
      },
    ]

    it('detects overlapping sessions', () => {
      const overlappingSession: WorkSessionData = {
        id: 'new-session',
        taskId: 'task-3',
        taskName: 'Task 3',
        startMinutes: 580, // 9:40
        endMinutes: 640, // 10:40
        type: TaskType.Focused,
        color: '#165DFF',
      }

      expect(checkOverlap(overlappingSession, sessions)).toBe(true)
    })

    it('detects non-overlapping sessions', () => {
      const nonOverlappingSession: WorkSessionData = {
        id: 'new-session',
        taskId: 'task-3',
        taskName: 'Task 3',
        startMinutes: 600, // 10:00
        endMinutes: 660, // 11:00
        type: TaskType.Focused,
        color: '#165DFF',
      }

      expect(checkOverlap(nonOverlappingSession, sessions)).toBe(false)
    })

    it('excludes specified session ID from overlap check', () => {
      const sessionToCheck: WorkSessionData = {
        id: 'session-1',
        taskId: 'task-1',
        taskName: 'Task 1',
        startMinutes: 540,
        endMinutes: 600,
        type: TaskType.Focused,
        color: '#165DFF',
      }

      expect(checkOverlap(sessionToCheck, sessions, 'session-1')).toBe(false)
    })
  })

  describe('getClockPosition', () => {
    it('calculates position for 12 o\'clock (0 minutes)', () => {
      const pos = getClockPosition(0, 50, 100, 100)
      expect(pos.x).toBeCloseTo(100)
      expect(pos.y).toBeCloseTo(50)
    })

    it('calculates position for 3 o\'clock (180 minutes)', () => {
      const pos = getClockPosition(180, 50, 100, 100)
      expect(pos.x).toBeCloseTo(150)
      expect(pos.y).toBeCloseTo(100)
    })

    it('calculates position for 6 o\'clock (360 minutes)', () => {
      const pos = getClockPosition(360, 50, 100, 100)
      expect(pos.x).toBeCloseTo(100)
      expect(pos.y).toBeCloseTo(150)
    })

    it('calculates position for 9 o\'clock (540 minutes)', () => {
      const pos = getClockPosition(540, 50, 100, 100)
      expect(pos.x).toBeCloseTo(50)
      expect(pos.y).toBeCloseTo(100)
    })
  })

  describe('generateArcPath', () => {
    it('generates valid SVG path for arc segment', () => {
      const path = generateArcPath(0, 180, 40, 60, 100, 100)
      expect(path).toContain('M ')
      expect(path).toContain('A ')
      expect(path).toContain('L ')
      expect(path).toContain('Z')
    })

    it('uses large arc flag for sessions over 12 hours', () => {
      const path = generateArcPath(0, 800, 40, 60, 100, 100)
      // Large arc flag should be 1
      expect(path).toMatch(/A \d+ \d+ 0 1 1/)
    })

    it('uses small arc flag for sessions under 12 hours', () => {
      const path = generateArcPath(0, 360, 40, 60, 100, 100)
      // Large arc flag should be 0
      expect(path).toMatch(/A \d+ \d+ 0 0 1/)
    })
  })

  describe('angleToMinutes', () => {
    it('converts mouse position to minutes', () => {
      // 12 o'clock position
      expect(angleToMinutes(100, 50, 100, 100)).toBe(0)

      // 3 o'clock position (approximately)
      const threeOclock = angleToMinutes(150, 100, 100, 100)
      expect(threeOclock).toBeGreaterThan(170)
      expect(threeOclock).toBeLessThan(190)

      // 6 o'clock position (approximately)
      const sixOclock = angleToMinutes(100, 150, 100, 100)
      expect(sixOclock).toBeGreaterThan(350)
      expect(sixOclock).toBeLessThan(370)
    })

    it('wraps around at 24 hours', () => {
      const minutes = angleToMinutes(100, 50, 100, 100)
      expect(minutes).toBeGreaterThanOrEqual(0)
      expect(minutes).toBeLessThan(1440)
    })
  })

  describe('findClosestEdge', () => {
    const sessions: WorkSessionData[] = [
      {
        id: 'session-1',
        taskId: 'task-1',
        taskName: 'Task 1',
        startMinutes: 540,
        endMinutes: 600,
        type: TaskType.Focused,
        color: '#165DFF',
      },
      {
        id: 'session-2',
        taskId: 'task-2',
        taskName: 'Task 2',
        startMinutes: 660,
        endMinutes: 720,
        type: TaskType.Admin,
        color: '#00B42A',
      },
    ]

    it('finds closest session start edge', () => {
      const result = findClosestEdge(545, sessions)
      expect(result).toEqual({
        sessionId: 'session-1',
        edge: 'start',
      })
    })

    it('finds closest session end edge', () => {
      const result = findClosestEdge(595, sessions)
      expect(result).toEqual({
        sessionId: 'session-1',
        edge: 'end',
      })
    })

    it('returns null if no edge within threshold', () => {
      const result = findClosestEdge(800, sessions)
      expect(result).toBeNull()
    })

    it('respects 30-minute threshold', () => {
      // 31 minutes away from session-1 start
      const result = findClosestEdge(509, sessions)
      expect(result).toBeNull()

      // 29 minutes away from session-1 start
      const result2 = findClosestEdge(511, sessions)
      expect(result2).toEqual({
        sessionId: 'session-1',
        edge: 'start',
      })
    })
  })
})
