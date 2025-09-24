import { describe, it, expect, vi } from 'vitest'
import { ScheduleFormatter, logSchedule, logGanttChart } from './schedule-formatter'
import { TaskType } from '../../shared/enums'
import type { Task } from '../../shared/types'
import type { SequencedTask } from '../../shared/sequencing-types'
import type { ScheduledItem } from '../../shared/unified-scheduler-adapter'
import type { DailyWorkPattern } from '../../shared/work-blocks-types'
import type { SchedulingDebugInfo } from '../../shared/unified-scheduler'

describe('ScheduleFormatter', () => {
  const mockTasks: Task[] = [
    {
      id: 'task-1',
      name: 'Test Task 1',
      type: TaskType.Focused,
      duration: 60,
      completed: false,
      priority: 1,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    {
      id: 'task-2',
      name: 'Test Task 2',
      type: TaskType.Admin,
      duration: 30,
      completed: false,
      priority: 2,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
  ]

  const mockWorkflows: SequencedTask[] = [
    {
      id: 'workflow-1',
      name: 'Test Workflow',
      type: TaskType.Focused,
      duration: 90,
      priority: 1,
      completed: false,
      steps: [
        {
          id: 'step-1',
          name: 'Step 1',
          duration: 45,
          taskType: TaskType.Focused,
          completed: false,
        },
        {
          id: 'step-2',
          name: 'Step 2',
          duration: 45,
          taskType: TaskType.Admin,
          completed: false,
        },
      ],
    },
  ]

  const mockScheduledItems: ScheduledItem[] = [
    {
      task: mockTasks[0],
      startTime: new Date('2024-01-01T09:00:00'),
      endTime: new Date('2024-01-01T10:00:00'),
      priority: 1,
    },
    {
      task: mockTasks[1],
      startTime: new Date('2024-01-01T10:00:00'),
      endTime: new Date('2024-01-01T10:30:00'),
      priority: 2,
    },
  ]

  const mockWorkPatterns: DailyWorkPattern[] = [
    {
      date: '2024-01-01',
      blocks: [
        {
          id: 'block-1',
          type: TaskType.Focused,
          startTime: '09:00',
          endTime: '12:00',
        },
        {
          id: 'block-2',
          type: TaskType.Admin,
          startTime: '13:00',
          endTime: '15:00',
        },
      ],
    },
  ]

  const mockDebugInfo: Partial<SchedulingDebugInfo> = {
    totalScheduled: 2,
    totalUnscheduled: 1,
    unscheduledItems: [
      {
        id: 'task-3',
        name: 'Unscheduled Task',
        type: TaskType.Focused,
        duration: 120,
        reason: 'No available time blocks',
      },
    ],
    blockUtilization: [
      {
        date: '2024-01-01',
        blockId: 'block-1',
        blockStart: '09:00',
        blockEnd: '12:00',
        type: 'focused',
        capacity: 180,
        used: 120,
        utilizationPercent: 66.67,
      },
    ],
    warnings: [],
    scheduleEfficiency: 75,
  }

  describe('formatScheduleGeneration', () => {
    it('formats schedule generation output correctly', () => {
      const output = ScheduleFormatter.formatScheduleGeneration(
        'optimal',
        mockTasks,
        mockWorkflows,
        mockScheduledItems,
        mockWorkPatterns,
        undefined,
        mockDebugInfo as SchedulingDebugInfo,
      )

      expect(output).toMatchObject({
        type: 'schedule_generation',
        schedulerUsed: 'optimal',
        summary: {
          totalTasks: 4, // 2 tasks + 2 workflow steps
          scheduledTasks: 2,
          unscheduledTasks: 1,
          totalDuration: 90, // 60 + 30
          timeSpan: {
            days: 1,
          },
        },
      })
      expect(output.timestamp).toBeDefined()
      expect(output.scheduledItems).toHaveLength(2)
      expect(output.unscheduledItems).toHaveLength(1)
      expect(output.debugInfo).toBeDefined()
    })

    it('handles empty scheduled items', () => {
      const output = ScheduleFormatter.formatScheduleGeneration(
        'flexible',
        [],
        [],
        [],
        [],
        undefined,
        undefined,
      )

      expect(output.summary).toMatchObject({
        totalTasks: 0,
        scheduledTasks: 0,
        unscheduledTasks: 0,
        totalDuration: 0,
        utilizationRate: 0,
      })
      expect(output.scheduledItems).toHaveLength(0)
    })

    it('filters out async-wait and break tasks from scheduled count', () => {
      const itemsWithBreaks: ScheduledItem[] = [
        ...mockScheduledItems,
        {
          task: {
            id: 'async-1',
            name: 'Async Wait',
            type: 'async-wait' as any,
            duration: 30,
          } as any,
          startTime: new Date('2024-01-01T11:00:00'),
          endTime: new Date('2024-01-01T11:30:00'),
          priority: 3,
        },
        {
          task: {
            id: 'break-1',
            name: 'Break',
            type: 'break' as any,
            duration: 15,
          } as any,
          startTime: new Date('2024-01-01T11:30:00'),
          endTime: new Date('2024-01-01T11:45:00'),
          priority: 4,
        },
      ]

      const output = ScheduleFormatter.formatScheduleGeneration(
        'deadline',
        mockTasks,
        [],
        itemsWithBreaks,
        mockWorkPatterns,
      )

      expect(output.summary.scheduledTasks).toBe(2) // Only real tasks
      expect(output.scheduledItems).toHaveLength(2)
    })

    it('includes warnings when provided', () => {
      const warnings = ['Warning 1', 'Warning 2']

      const output = ScheduleFormatter.formatScheduleGeneration(
        'mixed',
        mockTasks,
        mockWorkflows,
        mockScheduledItems,
        mockWorkPatterns,
        undefined,
        undefined,
        warnings,
      )

      expect(output.warnings).toEqual(warnings)
    })

    it('calculates utilization rate correctly', () => {
      const output = ScheduleFormatter.formatScheduleGeneration(
        'optimal',
        mockTasks,
        [],
        mockScheduledItems,
        mockWorkPatterns,
      )

      // Total capacity: 180 (focus) + 120 (admin) = 300 minutes
      // Actual work: 60 + 30 = 90 minutes
      // Utilization: 90/300 = 30%
      expect(output.summary.utilizationRate).toBe(30)
    })
  })

  describe('formatGanttDisplay', () => {
    it('formats Gantt chart display data', () => {
      const viewWindow = {
        start: new Date('2024-01-01T00:00:00'),
        end: new Date('2024-01-07T23:59:59'),
      }

      const output = ScheduleFormatter.formatGanttDisplay(
        mockScheduledItems,
        mockWorkPatterns,
        viewWindow,
        mockTasks,
        mockWorkflows,
        mockDebugInfo as SchedulingDebugInfo,
      )

      expect(output.type).toBe('gantt_display')
      expect(output.schedulerUsed).toBe('mixed')
      expect(output.summary.timeSpan.days).toBe(7)
    })
  })

  describe('formatDebugInfo', () => {
    it('formats debug information', () => {
      const output = ScheduleFormatter.formatDebugInfo(mockDebugInfo as SchedulingDebugInfo)

      expect(output).toMatchObject({
        type: 'debug_info',
        schedulerUsed: 'flexible',
        summary: {
          totalTasks: 3, // totalScheduled (2) + totalUnscheduled (1)
          scheduledTasks: 2,
          unscheduledTasks: 1,
        },
        unscheduledItems: [
          {
            id: 'task-3',
            name: 'Unscheduled Task',
            type: TaskType.Focused,
            duration: 120,
            reason: 'No available time blocks',
          },
        ],
        debugInfo: {
          unusedCapacity: {
            total: 60, // 180 - 120
          },
        },
      })
    })

    it('handles missing debug info fields', () => {
      const minimalDebugInfo = {
        totalScheduled: 1,
        totalUnscheduled: 0,
      }

      const output = ScheduleFormatter.formatDebugInfo(minimalDebugInfo as any)

      expect(output.summary.totalTasks).toBe(1)
      expect(output.summary.scheduledTasks).toBe(1)
      expect(output.summary.unscheduledTasks).toBe(0)
      expect(output.debugInfo?.unusedCapacity.total).toBe(0)
    })
  })

  describe('createReadableSummary', () => {
    it('creates human-readable summary', () => {
      const output = ScheduleFormatter.formatScheduleGeneration(
        'optimal',
        mockTasks,
        mockWorkflows,
        mockScheduledItems,
        mockWorkPatterns,
        undefined,
        mockDebugInfo as SchedulingDebugInfo,
      )

      const summary = ScheduleFormatter.createReadableSummary(output)

      expect(summary).toContain('Schedule SCHEDULE GENERATION')
      expect(summary).toContain('Scheduler: optimal')
      expect(summary).toContain('Total Tasks: 4')
      expect(summary).toContain('Scheduled: 2')
      expect(summary).toContain('Unscheduled: 1')
      expect(summary).toContain('Duration: 1h 30m')
      expect(summary).toContain('Utilization: 30%')
      expect(summary).toContain('Unscheduled Items:')
      expect(summary).toContain('Unscheduled Task')
      expect(summary).toContain('Unused Capacity:')
    })

    it('handles empty unscheduled items', () => {
      const output = ScheduleFormatter.formatScheduleGeneration(
        'flexible',
        mockTasks,
        [],
        mockScheduledItems,
        mockWorkPatterns,
      )

      const summary = ScheduleFormatter.createReadableSummary(output)

      expect(summary).not.toContain('Unscheduled Items:')
    })

    it('formats work blocks in summary', () => {
      const blocks = [
        {
          id: 'block-1',
          date: '2024-01-01',
          type: TaskType.Focused,
          startTime: new Date('2024-01-01T09:00:00'),
          endTime: new Date('2024-01-01T12:00:00'),
          capacity: 180,
          utilization: 66.67,
          items: 2,
        },
      ]

      const output = ScheduleFormatter.formatScheduleGeneration(
        'optimal',
        mockTasks,
        [],
        mockScheduledItems,
        mockWorkPatterns,
        blocks,
      )

      const summary = ScheduleFormatter.createReadableSummary(output)

      expect(summary).toContain('Work Blocks:')
      expect(summary).toContain('2024-01-01:')
      expect(summary).toContain('2 items (67% used)')
    })
  })

  describe('logSchedule', () => {
    it('logs schedule with formatter', () => {
      const mockLogger = {
        info: vi.fn(),
      }

      logSchedule(
        mockLogger,
        'optimal',
        mockTasks,
        mockWorkflows,
        mockScheduledItems,
        mockWorkPatterns,
        undefined,
        mockDebugInfo as SchedulingDebugInfo,
        ['Test warning'],
      )

      expect(mockLogger.info).toHaveBeenCalledTimes(2)
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[SCHEDULE_OUTPUT]',
        expect.objectContaining({
          type: 'schedule_generation',
          schedulerUsed: 'optimal',
        }),
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Schedule SCHEDULE GENERATION'),
      )
    })
  })

  describe('logGanttChart', () => {
    it('logs Gantt chart with formatter', () => {
      const mockLogger = {
        info: vi.fn(),
      }

      const viewWindow = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-07'),
      }

      logGanttChart(
        mockLogger,
        mockScheduledItems,
        mockWorkPatterns,
        viewWindow,
        mockTasks,
        mockWorkflows,
        mockDebugInfo as SchedulingDebugInfo,
      )

      expect(mockLogger.info).toHaveBeenCalledTimes(2)
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[GANTT_OUTPUT]',
        expect.objectContaining({
          type: 'gantt_display',
          schedulerUsed: 'mixed',
        }),
      )
    })
  })

  describe('edge cases', () => {
    it('handles cross-midnight time blocks', () => {
      const crossMidnightPatterns: DailyWorkPattern[] = [
        {
          date: '2024-01-01',
          blocks: [
            {
              id: 'night-block',
              type: TaskType.Focused,
              startTime: '22:00',
              endTime: '02:00',
            },
          ],
        },
      ]

      const output = ScheduleFormatter.formatScheduleGeneration(
        'optimal',
        [],
        [],
        [],
        crossMidnightPatterns,
      )

      // 4 hours duration (22:00 to 02:00)
      expect(output.patterns![0].blocks[0].startTime).toBe('22:00')
      expect(output.patterns![0].blocks[0].endTime).toBe('02:00')
    })

    it('handles items with dependencies', () => {
      const itemsWithDeps: ScheduledItem[] = [
        {
          task: {
            ...mockTasks[0],
            dependencies: ['task-2'],
          } as any,
          startTime: new Date('2024-01-01T10:30:00'),
          endTime: new Date('2024-01-01T11:30:00'),
          priority: 1,
        },
      ]

      const output = ScheduleFormatter.formatScheduleGeneration(
        'optimal',
        mockTasks,
        [],
        itemsWithDeps,
        mockWorkPatterns,
      )

      expect(output.scheduledItems[0].dependencies).toEqual(['task-2'])
    })
  })
})
