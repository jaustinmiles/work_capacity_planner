import { describe, it, expect, beforeAll } from 'vitest'
import { execSync } from 'child_process'
import { PrismaClient } from '@prisma/client'
import { scheduleItemsWithBlocksAndDebug } from '../flexible-scheduler'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { DailyWorkPattern } from '@shared/work-blocks-types'

describe('Database Integration Scheduling', () => {
  let testDb: PrismaClient
  let allTasks: Task[]
  let sequencedTasks: SequencedTask[]
  let workPatterns: DailyWorkPattern[]

  beforeAll(async () => {
    // Copy the backup database to a test location
    const testDbPath = 'prisma/test-integration.db'
    execSync(`cp prisma/backup-*-aligned-test-data.db ${testDbPath}`)
    
    // Connect to the test database
    testDb = new PrismaClient({
      datasources: {
        db: {
          url: `file:./test-integration.db`
        }
      }
    })

    // Get the active session
    const session = await testDb.session.findFirst({
      where: { isActive: true }
    })
    const sessionId = session?.id

    // Load all tasks
    const dbTasks = await testDb.task.findMany({
      where: { sessionId },
      include: { TaskStep: true }
    })

    // Format tasks - split into simple tasks and workflows
    allTasks = dbTasks.map(task => ({
      id: task.id,
      name: task.name,
      duration: task.duration,
      importance: task.importance,
      urgency: task.urgency,
      type: task.type as 'focused' | 'admin',
      category: task.category || 'work',
      asyncWaitTime: task.asyncWaitTime,
      dependencies: task.dependencies ? JSON.parse(task.dependencies) : [],
      completed: task.completed,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      sessionId: task.sessionId!,
      hasSteps: task.hasSteps,
      overallStatus: task.overallStatus as any,
      criticalPathDuration: task.criticalPathDuration || task.duration,
      worstCaseDuration: task.worstCaseDuration || task.duration,
      steps: task.TaskStep?.map(step => ({
        id: step.id,
        taskId: step.taskId,
        name: step.name,
        duration: step.duration,
        type: step.type,
        dependsOn: step.dependsOn ? JSON.parse(step.dependsOn) : [],
        asyncWaitTime: step.asyncWaitTime,
        status: step.status,
        stepIndex: step.stepIndex,
        percentComplete: step.percentComplete,
      }))
    }))

    // Separate workflows for sequencedTasks
    sequencedTasks = allTasks
      .filter(t => t.hasSteps && t.steps)
      .map(t => ({
        ...t,
        steps: t.steps!,
        totalDuration: t.duration,
      } as SequencedTask))

    // Load work patterns
    const patterns = await testDb.workPattern.findMany({
      where: { 
        sessionId,
        date: { in: ['2025-08-14', '2025-08-15'] }
      },
      include: { WorkBlock: true }
    })

    workPatterns = patterns.map(p => ({
      date: p.date,
      blocks: p.WorkBlock.map(b => ({
        id: b.id,
        patternId: b.patternId,
        startTime: b.startTime,
        endTime: b.endTime,
        type: b.type as 'focused' | 'admin' | 'mixed' | 'personal',
        capacity: b.capacity ? JSON.parse(b.capacity) : undefined
      })),
      meetings: [],
      accumulated: { focusMinutes: 0, adminMinutes: 0 }
    }))
  })

  it('should schedule real database data consistently with GanttChart', () => {
    // Filter out workflows from tasks (as GanttChart now does)
    const simpleTasksOnly = allTasks.filter(t => !t.hasSteps)
    
    console.log('\n=== Database Integration Test ===')
    console.log(`Simple tasks: ${simpleTasksOnly.length}`)
    console.log('Simple task names:', simpleTasksOnly.map(t => t.name))
    console.log(`Workflows: ${sequencedTasks.length}`)
    console.log('Workflow names:', sequencedTasks.map(t => t.name))
    console.log(`Work patterns: ${workPatterns.length} days`)
    
    // Schedule exactly as GanttChart does
    const startDate = new Date('2025-08-14T06:00:00')
    const { scheduledItems, debugInfo } = scheduleItemsWithBlocksAndDebug(
      simpleTasksOnly,
      sequencedTasks,
      workPatterns,
      startDate
    )

    console.log(`\nScheduled: ${scheduledItems.length} items`)
    console.log(`Unscheduled: ${debugInfo.unscheduledItems.length} items`)
    
    // Log the schedule
    console.log('\nSchedule:')
    scheduledItems.forEach(item => {
      const start = item.startTime.toLocaleString('en-US', { 
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        day: 'numeric',
        month: 'short'
      })
      const duration = item.duration
      console.log(`  ${start} (${duration}m): ${item.name}`)
    })

    // Assertions
    expect(scheduledItems.length).toBeGreaterThan(0)
    
    // Should schedule all simple tasks
    const scheduledTaskIds = new Set(scheduledItems.map(i => i.id))
    simpleTasksOnly.forEach(task => {
      expect(scheduledTaskIds.has(task.id)).toBe(true)
    })
    
    // Should schedule all workflow steps
    sequencedTasks.forEach(workflow => {
      workflow.steps.forEach(step => {
        const isScheduled = scheduledTaskIds.has(step.id) || 
                           debugInfo.warnings.some(w => w.includes(step.name))
        expect(isScheduled).toBe(true)
      })
    })

    // No duplicate IDs
    const idCounts = new Map<string, number>()
    scheduledItems.forEach(item => {
      const count = idCounts.get(item.id) || 0
      idCounts.set(item.id, count + 1)
    })
    idCounts.forEach((count, id) => {
      if (!id.includes('-wait')) { // Ignore async wait items
        expect(count).toBe(1)
      }
    })
  })

  it('should not have workflows in both tasks and sequencedTasks', () => {
    const workflowIds = new Set(sequencedTasks.map(w => w.id))
    const tasksWithSteps = allTasks.filter(t => t.hasSteps)
    
    // All workflows should be in sequencedTasks
    tasksWithSteps.forEach(task => {
      expect(workflowIds.has(task.id)).toBe(true)
    })
    
    // When filtered, simple tasks should have no workflows
    const simpleTasksOnly = allTasks.filter(t => !t.hasSteps)
    simpleTasksOnly.forEach(task => {
      expect(task.hasSteps).toBe(false)
      expect(workflowIds.has(task.id)).toBe(false)
    })
  })
})