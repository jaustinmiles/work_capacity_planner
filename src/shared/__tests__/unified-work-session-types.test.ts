import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fromLocalWorkSession,
  fromWorkSessionData,
  isActiveSession,
  isPausedSession,
  getElapsedMinutes,
  UnifiedWorkSession,
} from '../unified-work-session-types'

describe('unified-work-session-types', () => {
  describe('fromLocalWorkSession', () => {
    it('should convert basic local work session', () => {
      const localSession = {
        id: 'session-1',
        taskId: 'task-1',
        startTime: '2024-01-15T09:00:00Z',
        type: 'focus',
        duration: 60,
      }

      const result = fromLocalWorkSession(localSession)

      expect(result.id).toBe('session-1')
      expect(result.taskId).toBe('task-1')
      expect(result.startTime).toBeInstanceOf(Date)
      expect(result.type).toBe('focus')
      expect(result.actualMinutes).toBe(60)
    })

    it('should handle plannedDuration field', () => {
      const localSession = {
        id: 'session-1',
        taskId: 'task-1',
        startTime: '2024-01-15T09:00:00Z',
        type: 'admin',
        plannedDuration: 45,
      }

      const result = fromLocalWorkSession(localSession)

      expect(result.plannedMinutes).toBe(45)
    })

    it('should include optional fields when present', () => {
      const localSession = {
        id: 'session-1',
        taskId: 'task-1',
        startTime: '2024-01-15T09:00:00Z',
        endTime: '2024-01-15T10:00:00Z',
        type: 'focus',
        stepId: 'step-1',
        workflowId: 'workflow-1',
        isPaused: true,
        taskName: 'My Task',
        stepName: 'Step 1',
      }

      const result = fromLocalWorkSession(localSession)

      expect(result.stepId).toBe('step-1')
      expect(result.workflowId).toBe('workflow-1')
      expect(result.endTime).toBeInstanceOf(Date)
      expect(result.isPaused).toBe(true)
      expect(result.taskName).toBe('My Task')
      expect(result.stepName).toBe('Step 1')
    })
  })

  describe('fromWorkSessionData', () => {
    it('should convert session data with start/end minutes', () => {
      const sessionData = {
        id: 'session-1',
        taskId: 'task-1',
        startMinutes: 540, // 9:00 AM
        endMinutes: 600,   // 10:00 AM
        type: 'focus',
        completed: true,
      }

      const result = fromWorkSessionData(sessionData)

      expect(result.id).toBe('session-1')
      expect(result.taskId).toBe('task-1')
      expect(result.startTime).toBeInstanceOf(Date)
      expect(result.endTime).toBeInstanceOf(Date)
      expect(result.actualMinutes).toBe(60)
    })

    it('should handle incomplete sessions', () => {
      const sessionData = {
        id: 'session-1',
        taskId: 'task-1',
        startMinutes: 540,
        endMinutes: 600,
        type: 'focus',
        completed: false,
      }

      const result = fromWorkSessionData(sessionData)

      expect(result.endTime).toBeUndefined()
      expect(result.actualMinutes).toBeUndefined()
    })

    it('should include optional fields', () => {
      const sessionData = {
        id: 'session-1',
        taskId: 'task-1',
        startMinutes: 540,
        endMinutes: 600,
        type: 'focus',
        completed: false,
        stepId: 'step-1',
        notes: 'Some notes',
        taskName: 'Task Name',
        stepName: 'Step Name',
        color: '#FF5733',
      }

      const result = fromWorkSessionData(sessionData)

      expect(result.stepId).toBe('step-1')
      expect(result.notes).toBe('Some notes')
      expect(result.taskName).toBe('Task Name')
      expect(result.stepName).toBe('Step Name')
      expect(result.color).toBe('#FF5733')
    })
  })

  describe('isActiveSession', () => {
    it('should return true for active session (no endTime, no actualMinutes)', () => {
      const session: UnifiedWorkSession = {
        id: 'session-1',
        taskId: 'task-1',
        startTime: new Date(),
        plannedMinutes: 60,
        type: 'focus',
      }

      expect(isActiveSession(session)).toBe(true)
    })

    it('should return false for completed session with endTime', () => {
      const session: UnifiedWorkSession = {
        id: 'session-1',
        taskId: 'task-1',
        startTime: new Date('2024-01-15T09:00:00Z'),
        endTime: new Date('2024-01-15T10:00:00Z'),
        plannedMinutes: 60,
        type: 'focus',
      }

      expect(isActiveSession(session)).toBe(false)
    })

    it('should return false for completed session with actualMinutes', () => {
      const session: UnifiedWorkSession = {
        id: 'session-1',
        taskId: 'task-1',
        startTime: new Date(),
        plannedMinutes: 60,
        actualMinutes: 55,
        type: 'focus',
      }

      expect(isActiveSession(session)).toBe(false)
    })
  })

  describe('isPausedSession', () => {
    it('should return true when isPaused is true', () => {
      const session: UnifiedWorkSession = {
        id: 'session-1',
        taskId: 'task-1',
        startTime: new Date(),
        plannedMinutes: 60,
        type: 'focus',
        isPaused: true,
      }

      expect(isPausedSession(session)).toBe(true)
    })

    it('should return false when isPaused is false', () => {
      const session: UnifiedWorkSession = {
        id: 'session-1',
        taskId: 'task-1',
        startTime: new Date(),
        plannedMinutes: 60,
        type: 'focus',
        isPaused: false,
      }

      expect(isPausedSession(session)).toBe(false)
    })

    it('should return false when isPaused is undefined', () => {
      const session: UnifiedWorkSession = {
        id: 'session-1',
        taskId: 'task-1',
        startTime: new Date(),
        plannedMinutes: 60,
        type: 'focus',
      }

      expect(isPausedSession(session)).toBe(false)
    })
  })

  describe('getElapsedMinutes', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return actualMinutes for completed session', () => {
      const session: UnifiedWorkSession = {
        id: 'session-1',
        taskId: 'task-1',
        startTime: new Date('2024-01-15T09:00:00Z'),
        plannedMinutes: 60,
        actualMinutes: 55,
        type: 'focus',
      }

      expect(getElapsedMinutes(session)).toBe(55)
    })

    it('should calculate elapsed time for active session', () => {
      const startTime = new Date('2024-01-15T09:00:00Z')
      vi.setSystemTime(new Date('2024-01-15T09:30:00Z')) // 30 minutes later

      const session: UnifiedWorkSession = {
        id: 'session-1',
        taskId: 'task-1',
        startTime,
        plannedMinutes: 60,
        type: 'focus',
      }

      expect(getElapsedMinutes(session)).toBe(30)
    })

    it('should calculate elapsed time for session with endTime but no actualMinutes', () => {
      const session: UnifiedWorkSession = {
        id: 'session-1',
        taskId: 'task-1',
        startTime: new Date('2024-01-15T09:00:00Z'),
        endTime: new Date('2024-01-15T09:45:00Z'),
        plannedMinutes: 60,
        type: 'focus',
      }

      expect(getElapsedMinutes(session)).toBe(45)
    })
  })
})
