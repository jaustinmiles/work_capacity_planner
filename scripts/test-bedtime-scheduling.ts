#!/usr/bin/env npx tsx
/**
 * Test script to verify bedtime routine scheduling fix
 * Tests that workflows with async waits don't split across days unnecessarily
 */

import { PrismaClient } from '@prisma/client'
import { format } from 'date-fns'
import { flexibleScheduler } from '../src/renderer/utils/flexible-scheduler'
import { TaskType } from '../src/shared/enums'

const prisma = new PrismaClient()

async function main() {
  console.log('='.repeat(80))
  console.log('BEDTIME ROUTINE SCHEDULING TEST')
  console.log('='.repeat(80))

  try {
    // Find the test session
    const session = await prisma.session.findFirst({
      where: {
        name: {
          contains: 'test session friday night',
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!session) {
      console.error('❌ No session found matching "test session friday night"')
      process.exit(1)
    }

    console.log('\n📅 Testing with session:', session.name)

    // Get the bedtime routine workflow
    const workflow = await prisma.task.findFirst({
      where: {
        sessionId: session.id,
        name: {
          contains: 'Bedtime routine',
        },
        hasSteps: true,
      },
      include: {
        TaskStep: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })

    if (!workflow) {
      console.error('❌ No bedtime routine workflow found')
      process.exit(1)
    }

    console.log('📋 Found workflow:', workflow.name)
    console.log('  Total duration:', workflow.duration, 'minutes')
    console.log('  Steps:', workflow.TaskStep.length)

    // Get work patterns for the session
    const patterns = await prisma.workPattern.findMany({
      where: {
        sessionId: session.id,
      },
      orderBy: { date: 'asc' },
    })

    console.log('\n⏰ Work patterns found:', patterns.length)
    for (const pattern of patterns) {
      console.log('  -', format(new Date(pattern.date), 'EEEE, MMM d'))
    }

    // Prepare tasks for scheduling
    const tasks = await prisma.task.findMany({
      where: {
        sessionId: session.id,
      },
      include: {
        TaskStep: true,
      },
    })

    const sequencedTasks = tasks.filter(t => t.hasSteps).map(task => {
      const steps = task.TaskStep.map(step => ({
        id: step.id,
        taskId: step.taskId,
        name: step.name,
        duration: step.duration,
        type: step.type as TaskType,
        dependsOn: step.dependsOn as string[] || [],
        asyncWaitTime: step.asyncWaitTime || 0,
        status: step.status,
        stepIndex: step.stepIndex,
      }))

      return {
        id: task.id,
        name: task.name,
        duration: task.duration,
        importance: task.importance,
        urgency: task.urgency,
        type: task.type as TaskType,
        deadline: task.deadline,
        dependencies: task.dependencies as string[] || [],
        overallStatus: task.overallStatus,
        steps,
        hasSteps: true as const,
      }
    })

    const regularTasks = tasks.filter(t => !t.hasSteps).map(task => ({
      id: task.id,
      name: task.name,
      duration: task.duration,
      importance: task.importance,
      urgency: task.urgency,
      type: task.type as TaskType,
      deadline: task.deadline,
      dependencies: task.dependencies as string[] || [],
      overallStatus: task.overallStatus,
      hasSteps: false as const,
    }))

    // Test scheduling with Friday evening time (8 PM)
    const testDate = new Date('2025-08-29T20:00:00')
    console.log('\n🧪 Testing scheduling at:', format(testDate, 'EEEE, MMM d h:mm a'))

    const workPatterns = patterns.map(p => ({
      date: p.date,
      blocks: (p.pattern as any).blocks || [],
    }))

    const result = flexibleScheduler(
      regularTasks,
      sequencedTasks,
      workPatterns,
      testDate,
      { allowTaskSplitting: true }
    )

    console.log('\n📊 Scheduling Results:')
    console.log('  Total items scheduled:', result.scheduledItems.length)

    // Check bedtime routine scheduling
    const bedtimeSteps = result.scheduledItems.filter(item => 
      item.taskName.includes('Bedtime routine')
    )

    console.log('\n🛏️ Bedtime Routine Scheduling:')
    if (bedtimeSteps.length === 0) {
      console.log('  ❌ No bedtime routine steps were scheduled')
    } else {
      // Group by date
      const stepsByDate = new Map<string, typeof bedtimeSteps>()
      for (const step of bedtimeSteps) {
        const dateStr = format(new Date(step.scheduledStartTime), 'yyyy-MM-dd')
        if (!stepsByDate.has(dateStr)) {
          stepsByDate.set(dateStr, [])
        }
        stepsByDate.get(dateStr)!.push(step)
      }

      console.log(`  Total steps scheduled: ${bedtimeSteps.length}`)
      console.log(`  Scheduled across ${stepsByDate.size} day(s)`)

      for (const [dateStr, steps] of stepsByDate) {
        console.log(`\n  📅 ${format(new Date(dateStr), 'EEEE, MMM d')}:`)
        for (const step of steps.sort((a, b) => 
          new Date(a.scheduledStartTime).getTime() - new Date(b.scheduledStartTime).getTime()
        )) {
          const start = new Date(step.scheduledStartTime)
          const end = new Date(step.scheduledEndTime)
          console.log(`    ${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}: ${step.taskName}`)
        }
      }

      // Check if it was split unnecessarily
      if (stepsByDate.size > 1) {
        console.log('\n  ⚠️  WARNING: Bedtime routine was split across multiple days!')
        
        // Check available time on first day
        const firstDate = Array.from(stepsByDate.keys())[0]
        const firstDayPattern = patterns.find(p => p.date === firstDate)
        if (firstDayPattern) {
          const blocks = (firstDayPattern.pattern as any).blocks || []
          let totalAvailable = 0
          for (const block of blocks) {
            if (block.capacity) {
              totalAvailable += (block.capacity.focusMinutes || 0) + (block.capacity.adminMinutes || 0)
            }
          }
          console.log(`  First day (${firstDate}) had ${totalAvailable} minutes available`)
          console.log(`  Workflow needs ${workflow.duration} minutes total`)
          
          if (totalAvailable >= workflow.duration) {
            console.log('  ❌ BUG CONFIRMED: Workflow was split despite sufficient time on first day')
          }
        }
      } else {
        console.log('\n  ✅ SUCCESS: All bedtime routine steps scheduled on the same day!')
      }
    }

    // Show debug info if available
    if (result.debugInfo) {
      console.log('\n🔍 Debug Info:')
      if (result.debugInfo.asyncDependencies && result.debugInfo.asyncDependencies.length > 0) {
        console.log('  Async dependencies:', result.debugInfo.asyncDependencies)
      }
      if (result.debugInfo.skippedItems && result.debugInfo.skippedItems.length > 0) {
        console.log('  Skipped items:', result.debugInfo.skippedItems)
      }
    }

  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()