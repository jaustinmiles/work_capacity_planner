import { describe, it, expect } from 'vitest'
import {
  createSnapshotData,
  serializeSnapshotData,
  deserializeSnapshotData,
  recordToSnapshot,
  snapshotToRecord,
  ScheduleSnapshotData,
  ScheduleSnapshot,
  ScheduleSnapshotRecord,
} from '../schedule-snapshot-types'
import { ScheduleResult } from '../unified-scheduler'

describe('schedule-snapshot-types', () => {
  // Create minimal mock schedule result
  const createMockScheduleResult = (): ScheduleResult => ({
    items: [],
    metrics: {
      tasksScheduled: 5,
      tasksUnscheduled: 1,
      totalMinutesScheduled: 300,
      blockUtilization: 75,
      schedulingTimeMs: 10,
    },
    debugInfo: {
      scheduledItems: [],
      unscheduledItems: [],
      blockUtilization: [
        { blockId: 'block-1', used: 60, total: 90, percentage: 66.7 },
      ],
      totalScheduled: 5,
      totalUnscheduled: 1,
      scheduleEfficiency: 83.3,
      warnings: ['Some task was deferred'],
    },
  })

  const mockSnapshotData: ScheduleSnapshotData = {
    capturedAt: '2024-01-15T10:00:00.000Z',
    scheduledItems: [],
    unscheduledItems: [],
    blockUtilization: [
      { blockId: 'block-1', used: 60, total: 90, percentage: 66.7 },
    ],
    metrics: {
      tasksScheduled: 5,
      tasksUnscheduled: 1,
      totalMinutesScheduled: 300,
      blockUtilization: 75,
      schedulingTimeMs: 10,
    },
    warnings: ['Warning message'],
    totalScheduled: 5,
    totalUnscheduled: 1,
    scheduleEfficiency: 83.3,
  }

  const mockSnapshot: ScheduleSnapshot = {
    id: 'snapshot-1',
    sessionId: 'session-1',
    createdAt: new Date('2024-01-15T10:00:00.000Z'),
    label: 'Morning Plan',
    data: mockSnapshotData,
  }

  const mockRecord: ScheduleSnapshotRecord = {
    id: 'snapshot-1',
    sessionId: 'session-1',
    createdAt: '2024-01-15T10:00:00.000Z',
    label: 'Morning Plan',
    snapshotData: JSON.stringify(mockSnapshotData),
  }

  describe('createSnapshotData', () => {
    it('should create snapshot data from schedule result', () => {
      const result = createMockScheduleResult()
      const capturedAt = new Date('2024-01-15T10:00:00.000Z')

      const snapshotData = createSnapshotData(result, capturedAt)

      expect(snapshotData.capturedAt).toBe('2024-01-15T10:00:00.000Z')
      expect(snapshotData.totalScheduled).toBe(5)
      expect(snapshotData.totalUnscheduled).toBe(1)
      expect(snapshotData.scheduleEfficiency).toBe(83.3)
      expect(snapshotData.warnings).toContain('Some task was deferred')
    })

    it('should handle null metrics', () => {
      const result = createMockScheduleResult()
      result.metrics = undefined as any
      const capturedAt = new Date('2024-01-15T10:00:00.000Z')

      const snapshotData = createSnapshotData(result, capturedAt)

      expect(snapshotData.metrics).toBeNull()
    })

    it('should preserve block utilization data', () => {
      const result = createMockScheduleResult()
      const capturedAt = new Date()

      const snapshotData = createSnapshotData(result, capturedAt)

      expect(snapshotData.blockUtilization).toHaveLength(1)
      expect(snapshotData.blockUtilization[0].blockId).toBe('block-1')
    })
  })

  describe('serializeSnapshotData', () => {
    it('should serialize snapshot data to JSON string', () => {
      const serialized = serializeSnapshotData(mockSnapshotData)

      expect(typeof serialized).toBe('string')
      expect(serialized).toContain('"capturedAt"')
      expect(serialized).toContain('"totalScheduled":5')
    })

    it('should produce valid JSON', () => {
      const serialized = serializeSnapshotData(mockSnapshotData)

      expect(() => JSON.parse(serialized)).not.toThrow()
    })
  })

  describe('deserializeSnapshotData', () => {
    it('should deserialize JSON string to snapshot data', () => {
      const json = JSON.stringify(mockSnapshotData)

      const deserialized = deserializeSnapshotData(json)

      expect(deserialized.capturedAt).toBe(mockSnapshotData.capturedAt)
      expect(deserialized.totalScheduled).toBe(5)
      expect(deserialized.scheduleEfficiency).toBe(83.3)
    })

    it('should roundtrip serialize/deserialize correctly', () => {
      const serialized = serializeSnapshotData(mockSnapshotData)
      const deserialized = deserializeSnapshotData(serialized)

      expect(deserialized).toEqual(mockSnapshotData)
    })
  })

  describe('recordToSnapshot', () => {
    it('should convert database record to snapshot entity', () => {
      const snapshot = recordToSnapshot(mockRecord)

      expect(snapshot.id).toBe('snapshot-1')
      expect(snapshot.sessionId).toBe('session-1')
      expect(snapshot.label).toBe('Morning Plan')
      expect(snapshot.createdAt).toBeInstanceOf(Date)
      expect(snapshot.createdAt.toISOString()).toBe('2024-01-15T10:00:00.000Z')
    })

    it('should deserialize snapshot data from record', () => {
      const snapshot = recordToSnapshot(mockRecord)

      expect(snapshot.data.totalScheduled).toBe(5)
      expect(snapshot.data.scheduleEfficiency).toBe(83.3)
    })

    it('should handle null label', () => {
      const recordWithNullLabel: ScheduleSnapshotRecord = {
        ...mockRecord,
        label: null,
      }

      const snapshot = recordToSnapshot(recordWithNullLabel)

      expect(snapshot.label).toBeNull()
    })
  })

  describe('snapshotToRecord', () => {
    it('should convert snapshot entity to database record', () => {
      const record = snapshotToRecord(mockSnapshot)

      expect(record.id).toBe('snapshot-1')
      expect(record.sessionId).toBe('session-1')
      expect(record.label).toBe('Morning Plan')
      expect(record.createdAt).toBe('2024-01-15T10:00:00.000Z')
    })

    it('should serialize snapshot data in record', () => {
      const record = snapshotToRecord(mockSnapshot)

      expect(typeof record.snapshotData).toBe('string')
      const parsedData = JSON.parse(record.snapshotData)
      expect(parsedData.totalScheduled).toBe(5)
    })

    it('should roundtrip record conversion correctly', () => {
      const record = snapshotToRecord(mockSnapshot)
      const restored = recordToSnapshot(record)

      expect(restored.id).toBe(mockSnapshot.id)
      expect(restored.sessionId).toBe(mockSnapshot.sessionId)
      expect(restored.label).toBe(mockSnapshot.label)
      expect(restored.data.totalScheduled).toBe(mockSnapshot.data.totalScheduled)
    })

    it('should handle snapshot with null label', () => {
      const snapshotWithNullLabel: ScheduleSnapshot = {
        ...mockSnapshot,
        label: null,
      }

      const record = snapshotToRecord(snapshotWithNullLabel)

      expect(record.label).toBeNull()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty arrays in snapshot data', () => {
      const emptyData: ScheduleSnapshotData = {
        ...mockSnapshotData,
        scheduledItems: [],
        unscheduledItems: [],
        blockUtilization: [],
        warnings: [],
      }

      const serialized = serializeSnapshotData(emptyData)
      const deserialized = deserializeSnapshotData(serialized)

      expect(deserialized.scheduledItems).toEqual([])
      expect(deserialized.warnings).toEqual([])
    })

    it('should preserve complex nested objects', () => {
      const dataWithMetrics: ScheduleSnapshotData = {
        ...mockSnapshotData,
        metrics: {
          tasksScheduled: 10,
          tasksUnscheduled: 2,
          totalMinutesScheduled: 600,
          blockUtilization: 85,
          schedulingTimeMs: 15,
        },
      }

      const serialized = serializeSnapshotData(dataWithMetrics)
      const deserialized = deserializeSnapshotData(serialized)

      expect(deserialized.metrics?.tasksScheduled).toBe(10)
      expect(deserialized.metrics?.blockUtilization).toBe(85)
    })
  })
})
