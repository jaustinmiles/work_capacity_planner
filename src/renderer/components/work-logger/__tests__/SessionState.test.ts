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
import type { UserTaskType } from '@shared/user-task-types'
import type { WorkSessionData } from '../SessionState'

// Mock user task types for testing
const mockUserTypes: UserTaskType[] = [
  { id: 'focused', sessionId: 'session-1', name: 'Focus', emoji: '🎯', color: '#165DFF', sortOrder: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'admin', sessionId: 'session-1', name: 'Admin', emoji: '📋', color: '#FF9500', sortOrder: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'personal', sessionId: 'session-1', name: 'Personal', emoji: '🌱', color: '#00B42A', sortOrder: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
]

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
      expect(getTypeColor(mockUserTypes, 'focused')).toBe('#165DFF')
      expect(getTypeColor(mockUserTypes, 'admin')).toBe('#FF9500') // Orange for admin tasks
      expect(getTypeColor(mockUserTypes, 'personal')).toBe('#00B42A') // Green for personal tasks
    })

    it('returns default gray for unknown type', () => {
      expect(getTypeColor(mockUserTypes, 'unknown')).toBe('#808080')
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
        type: 'focused', // User-defined type ID
        color: '#165DFF',
      },
      {
        id: 'session-2',
        taskId: 'task-2',
        taskName: 'Task 2',
        startMinutes: 660, // 11:00
        endMinutes: 720, // 12:00
        type: 'admin', // User-defined type ID
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
        type: 'focused',
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
        type: 'focused',
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
        type: 'focused',
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
    it('generates valid SVG path for arc segment within workday', () => {
      // 9am to 11am (within 8am-8pm workday)
      const path = generateArcPath(540, 660, 40, 60, 100, 100, 8, 12)
      expect(path).toContain('M ')
      expect(path).toContain('A ')
      expect(path).toContain('L ')
      expect(path).toContain('Z')
    })

    it('returns empty string for times outside workday', () => {
      // 6am to 7am (before 8am workday start)
      const path = generateArcPath(360, 420, 40, 60, 100, 100, 8, 12)
      expect(path).toBe('')
    })

    it('uses small arc flag for sessions under 6 hours', () => {
      // 9am to 2pm (5 hours, within workday)
      const path = generateArcPath(540, 840, 40, 60, 100, 100, 8, 12)
      // Large arc flag should be 0
      expect(path).toMatch(/A \d+ \d+ 0 0 1/)
    })

    it('uses large arc flag for sessions over 6 hours', () => {
      // 8am to 3pm (7 hours, within workday)
      const path = generateArcPath(480, 900, 40, 60, 100, 100, 8, 12)
      // Large arc flag should be 1
      expect(path).toMatch(/A \d+ \d+ 0 1 1/)
    })
  })

  describe('angleToMinutes', () => {
    it('converts mouse position to minutes for 12-hour workday', () => {
      // Top position (8am start of workday)
      expect(angleToMinutes(100, 50, 100, 100, 8, 12)).toBe(480) // 8am = 480 minutes

      // Right position (approximately 11am)
      const elevenAm = angleToMinutes(150, 100, 100, 100, 8, 12)
      expect(elevenAm).toBeGreaterThan(650) // 10:50am
      expect(elevenAm).toBeLessThan(690) // 11:30am

      // Bottom position (approximately 2pm)
      const twoPm = angleToMinutes(100, 150, 100, 100, 8, 12)
      expect(twoPm).toBeGreaterThan(830) // 1:50pm
      expect(twoPm).toBeLessThan(870) // 2:30pm
    })

    it('constrains to workday hours', () => {
      const minutes = angleToMinutes(100, 50, 100, 100, 8, 12)
      expect(minutes).toBeGreaterThanOrEqual(480) // 8am
      expect(minutes).toBeLessThanOrEqual(1200) // 8pm
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
        type: 'focused',
        color: '#165DFF',
      },
      {
        id: 'session-2',
        taskId: 'task-2',
        taskName: 'Task 2',
        startMinutes: 660,
        endMinutes: 720,
        type: 'admin',
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
