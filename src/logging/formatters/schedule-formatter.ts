/**
 * Schedule and Gantt Chart formatter for AI-readable logging
 * Provides structured output that can be easily parsed and analyzed
 */

import { LegacyScheduledItem } from '../../shared/unified-scheduler-adapter'
import { DailyWorkPattern } from '../../shared/work-blocks-types'
import { Task } from '../../shared/types'
import { SequencedTask } from '../../shared/sequencing-types'

interface ScheduleLogOutput {
  timestamp: string
  type: 'schedule_generation' | 'gantt_display' | 'debug_info'
  schedulerUsed: 'optimal' | 'flexible' | 'deadline' | 'mixed'
  summary: {
    totalTasks: number
    scheduledTasks: number
    unscheduledTasks: number
    totalDuration: number // minutes
    timeSpan: {
      start: string
      end: string
      days: number
    }
    utilizationRate: number // percentage
  }
  patterns?: DailyWorkPattern[]
  scheduledItems?: {
    id: string
    name: string
    type: string
    startTime: string
    endTime: string
    duration: number
    priority?: number
    dependencies?: string[]
    blockId?: string
  }[]
  unscheduledItems?: {
    id: string
    name: string
    type: string
    duration: number
    reason: string
    dependencies?: string[]
  }[]
  blocks?: {
    id: string
    date: string
    type: string
    startTime: string
    endTime: string
    capacity?: number
    utilization?: number
    items: number
  }[]
  warnings?: string[]
  debugInfo?: {
    unusedCapacity: {
      focus: number
      admin: number
      total: number
    }
    blockUtilization: Array<{
      date: string
      blockStart: string
      blockEnd: string
      capacity: number
      used: number
      utilizationPercent: number
    }>
    criticalPath?: string[]
    asyncSavings?: number
  }
}

export class ScheduleFormatter {
  /**
   * Format schedule generation result for logging
   */
  static formatScheduleGeneration(
    schedulerType: 'optimal' | 'flexible' | 'deadline' | 'mixed',
    tasks: Task[],
    workflows: SequencedTask[],
    scheduledItems: LegacyScheduledItem[],
    workPatterns: DailyWorkPattern[],
    blocks?: any[],
    debugInfo?: any,
    warnings?: string[],
  ): ScheduleLogOutput {
    const now = new Date()
    const scheduled = scheduledItems.filter(item =>
      item.type !== 'async-wait' && item.type !== 'break',
    )

    // Calculate time span
    const startTimes = scheduledItems.map(item => item.startTime)
    const endTimes = scheduledItems.map(item => item.endTime)
    const earliestStart = startTimes.length > 0 ? new Date(Math.min(...startTimes.map(d => d.getTime()))) : now
    const latestEnd = endTimes.length > 0 ? new Date(Math.max(...endTimes.map(d => d.getTime()))) : now
    const daySpan = Math.ceil((latestEnd.getTime() - earliestStart.getTime()) / (1000 * 60 * 60 * 24))

    // Calculate total available capacity
    const totalCapacity = workPatterns.reduce((sum, pattern) => {
      return sum + pattern.blocks.reduce((blockSum, block) => {
        const duration = this.getBlockDuration(block.startTime, block.endTime)
        return blockSum + duration
      }, 0)
    }, 0)

    // Calculate actual work time
    const actualWorkTime = scheduled.reduce((sum, item) => sum + item.duration, 0)
    const utilizationRate = totalCapacity > 0 ? (actualWorkTime / totalCapacity) * 100 : 0

    const output: ScheduleLogOutput = {
      timestamp: now.toISOString(),
      type: 'schedule_generation',
      schedulerUsed: schedulerType,
      summary: {
        totalTasks: tasks.length + workflows.reduce((sum, wf) => sum + (wf.steps?.length || 0), 0),
        scheduledTasks: scheduled.length,
        unscheduledTasks: (debugInfo?.unscheduledItems?.length || 0),
        totalDuration: actualWorkTime,
        timeSpan: {
          start: earliestStart.toISOString(),
          end: latestEnd.toISOString(),
          days: daySpan,
        },
        utilizationRate: Math.round(utilizationRate * 100) / 100,
      },
      patterns: workPatterns.map(pattern => ({
        ...pattern,
        // Simplify for logging
        blocks: pattern.blocks.map(block => ({
          ...block,
          startTime: block.startTime,
          endTime: block.endTime,
          type: block.type,
        })),
      })) as DailyWorkPattern[],
      scheduledItems: scheduled.map(item => ({
        id: item.id,
        name: item.name,
        type: item.type,
        startTime: item.startTime.toISOString(),
        endTime: item.endTime.toISOString(),
        duration: item.duration,
        priority: item.priority,
        dependencies: (item as any).dependencies,
        blockId: (item as any).blockId,
      })),
      warnings,
    }

    // Add unscheduled items if present
    if (debugInfo?.unscheduledItems && debugInfo.unscheduledItems.length > 0) {
      output.unscheduledItems = debugInfo.unscheduledItems.map((item: any) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        duration: item.duration,
        reason: item.reason || 'Unknown reason',
        dependencies: (item as any).dependencies,
      }))
    }

    // Add blocks if provided
    if (blocks && blocks.length > 0) {
      output.blocks = blocks.map(block => ({
        id: block.id,
        date: block.date,
        type: block.type,
        startTime: block.startTime.toISOString(),
        endTime: block.endTime.toISOString(),
        capacity: (block as any).capacity,
        utilization: (block as any).utilization,
        items: block.items?.length || 0,
      }))
    }

    // Add debug info if provided
    if (debugInfo) {
      output.debugInfo = {
        unusedCapacity: {
          focus: debugInfo.unusedFocusCapacity || 0,
          admin: debugInfo.unusedAdminCapacity || 0,
          total: (debugInfo.unusedFocusCapacity || 0) + (debugInfo.unusedAdminCapacity || 0),
        },
        blockUtilization: debugInfo.blockUtilization || [],
        criticalPath: debugInfo.criticalPath,
        asyncSavings: debugInfo.asyncParallelTime,
      }
    }

    return output
  }

  /**
   * Format Gantt chart display data for logging
   */
  static formatGanttDisplay(
    scheduledItems: LegacyScheduledItem[],
    workPatterns: DailyWorkPattern[],
    viewWindow: { start: Date; end: Date },
    tasks: Task[],
    workflows: SequencedTask[],
    debugInfo?: any,
  ): ScheduleLogOutput {
    const output = this.formatScheduleGeneration(
      'mixed', // Gantt uses mixed scheduling
      tasks,
      workflows,
      scheduledItems,
      workPatterns,
      undefined,
      debugInfo,
    )

    output.type = 'gantt_display'

    // Add view window info
    output.summary = {
      ...output.summary,
      timeSpan: {
        start: viewWindow.start.toISOString(),
        end: viewWindow.end.toISOString(),
        days: Math.ceil((viewWindow.end.getTime() - viewWindow.start.getTime()) / (1000 * 60 * 60 * 24)),
      },
    }

    return output
  }

  /**
   * Format debug info for logging
   */
  static formatDebugInfo(debugInfo: any): ScheduleLogOutput {
    return {
      timestamp: new Date().toISOString(),
      type: 'debug_info',
      schedulerUsed: 'flexible', // Debug info usually comes from flexible scheduler
      summary: {
        totalTasks: debugInfo.totalItems || 0,
        scheduledTasks: debugInfo.scheduledCount || 0,
        unscheduledTasks: debugInfo.unscheduledItems?.length || 0,
        totalDuration: debugInfo.totalDuration || 0,
        timeSpan: {
          start: '',
          end: '',
          days: 0,
        },
        utilizationRate: debugInfo.utilizationRate || 0,
      },
      unscheduledItems: debugInfo.unscheduledItems?.map((item: any) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        duration: item.duration,
        reason: item.reason,
        dependencies: (item as any).dependencies,
      })),
      warnings: debugInfo.warnings,
      debugInfo: {
        unusedCapacity: {
          focus: debugInfo.unusedFocusCapacity || 0,
          admin: debugInfo.unusedAdminCapacity || 0,
          total: (debugInfo.unusedFocusCapacity || 0) + (debugInfo.unusedAdminCapacity || 0),
        },
        blockUtilization: debugInfo.blockUtilization || [],
      },
    }
  }

  /**
   * Create a human-readable summary from schedule log output
   */
  static createReadableSummary(output: ScheduleLogOutput): string {
    const lines: string[] = [
      `=== Schedule ${output.type.replace('_', ' ').toUpperCase()} ===`,
      `Timestamp: ${output.timestamp}`,
      `Scheduler: ${output.schedulerUsed}`,
      '',
      '📊 Summary:',
      `  • Total Tasks: ${output.summary.totalTasks}`,
      `  • Scheduled: ${output.summary.scheduledTasks}`,
      `  • Unscheduled: ${output.summary.unscheduledTasks}`,
      `  • Duration: ${Math.floor(output.summary.totalDuration / 60)}h ${output.summary.totalDuration % 60}m`,
      `  • Utilization: ${output.summary.utilizationRate}%`,
      `  • Time Span: ${output.summary.timeSpan.days} days`,
      '',
    ]

    if (output.unscheduledItems && output.unscheduledItems.length > 0) {
      lines.push('⚠️ Unscheduled Items:')
      output.unscheduledItems.forEach(item => {
        lines.push(`  • ${item.name} (${item.duration}m): ${item.reason}`)
      })
      lines.push('')
    }

    if (output.debugInfo?.unusedCapacity) {
      const unused = output.debugInfo.unusedCapacity
      lines.push('💡 Unused Capacity:')
      lines.push(`  • Focus: ${unused.focus} minutes`)
      lines.push(`  • Admin: ${unused.admin} minutes`)
      lines.push(`  • Total: ${unused.total} minutes`)
      lines.push('')
    }

    if (output.warnings && output.warnings.length > 0) {
      lines.push('⚠️ Warnings:')
      output.warnings.forEach(warning => {
        lines.push(`  • ${warning}`)
      })
      lines.push('')
    }

    if (output.blocks && output.blocks.length > 0) {
      lines.push('📅 Work Blocks:')
      const blocksByDate = output.blocks.reduce((acc, block) => {
        if (!acc[block.date]) acc[block.date] = []
        acc[block.date].push(block)
        return acc
      }, {} as Record<string, typeof output.blocks>)

      Object.entries(blocksByDate).forEach(([date, blocks]) => {
        lines.push(`  ${date}:`)
        blocks!.forEach(block => {
          const utilization = block.utilization !== undefined ? ` (${Math.round(block.utilization)}% used)` : ''
          lines.push(`    • ${block.type} ${this.formatTime(block.startTime)}-${this.formatTime(block.endTime)}: ${block.items} items${utilization}`)
        })
      })
    }

    return lines.join('\n')
  }

  private static getBlockDuration(startTime: string, endTime: string): number {
    const [startHour, startMin] = startTime.split(':').map(Number)
    const [endHour, endMin] = endTime.split(':').map(Number)

    let duration = (endHour * 60 + endMin) - (startHour * 60 + startMin)
    if (duration < 0) duration += 24 * 60 // Handle cross-midnight

    return duration
  }

  private static formatTime(isoString: string): string {
    const date = new Date(isoString)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
}

/**
 * Logger extension for schedule-specific logging
 */
export function logSchedule(
  logger: any,
  schedulerType: 'optimal' | 'flexible' | 'deadline' | 'mixed',
  tasks: Task[],
  workflows: SequencedTask[],
  scheduledItems: any[],
  workPatterns: DailyWorkPattern[],
  blocks?: any[],
  debugInfo?: any,
  warnings?: string[],
): void {
  const output = ScheduleFormatter.formatScheduleGeneration(
    schedulerType,
    tasks,
    workflows,
    scheduledItems,
    workPatterns,
    blocks,
    debugInfo,
    warnings,
  )

  // Log structured data
  logger.info('[SCHEDULE_OUTPUT]', output)

  // Also log human-readable summary
  const summary = ScheduleFormatter.createReadableSummary(output)
  logger.info('\n' + summary)
}

/**
 * Logger extension for Gantt chart logging
 */
export function logGanttChart(
  logger: any,
  scheduledItems: LegacyScheduledItem[],
  workPatterns: DailyWorkPattern[],
  viewWindow: { start: Date; end: Date },
  tasks: Task[],
  workflows: SequencedTask[],
  debugInfo?: any,
): void {
  const output = ScheduleFormatter.formatGanttDisplay(
    scheduledItems,
    workPatterns,
    viewWindow,
    tasks,
    workflows,
    debugInfo,
  )

  // Log structured data
  logger.info('[GANTT_OUTPUT]', output)

  // Also log human-readable summary
  const summary = ScheduleFormatter.createReadableSummary(output)
  logger.info('\n' + summary)
}
