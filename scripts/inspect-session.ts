#!/usr/bin/env npx tsx
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

/**
 * Database inspection script for debugging scheduling issues
 * Usage: npx tsx scripts/inspect-session.ts [session-name]
 */

import { PrismaClient } from '@prisma/client'
import { format } from 'date-fns'

const prisma = new PrismaClient()

// Valid task types according to our enum
const VALID_TASK_TYPES = ['focused', 'admin', 'personal']

async function main() {
  const sessionNameSearch = process.argv[2]

  try {
    // Find session
    let session
    if (sessionNameSearch) {
      session = await prisma.session.findFirst({
        where: {
          name: {
            contains: sessionNameSearch,
          },
        },
        orderBy: { createdAt: 'desc' },
      })
    } else {
      // Get most recent session
      session = await prisma.session.findFirst({
        orderBy: { createdAt: 'desc' },
      })
    }

    if (!session) {
      console.error(`❌ No session found ${sessionNameSearch ? `matching "${sessionNameSearch}"` : ''}`)
      process.exit(1)
    }

    console.log('='.repeat(80))
    console.log('SESSION INSPECTION')
    console.log('='.repeat(80))

    console.log('\n📅 SESSION:')
    console.log(`  Name: ${session.name}`)
    console.log(`  ID: ${session.id}`)
    console.log(`  Created: ${format(session.createdAt, 'yyyy-MM-dd HH:mm:ss')}`)

    // Get workflows (tasks with hasSteps = true)
    const workflows = await prisma.task.findMany({
      where: {
        sessionId: session.id,
        hasSteps: true,
      },
      include: {
        TaskStep: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })

    console.log(`\n📋 WORKFLOWS (${workflows.length} total):`)
    console.log('-'.repeat(80))

    for (const workflow of workflows) {
      console.log(`\n🔄 ${workflow.name}`)
      console.log(`  Duration: ${workflow.duration}min`)
      console.log(`  Status: ${workflow.overallStatus}`)
      console.log(`  Type: ${workflow.type}`)
      console.log(`  Deadline: ${workflow.deadline ? format(workflow.deadline, 'yyyy-MM-dd HH:mm') : 'None'}`)

      // Check for invalid workflow type
      if (!VALID_TASK_TYPES.includes(workflow.type)) {
        console.log(`  ⚠️  WARNING: Invalid type "${workflow.type}" - should be one of: ${VALID_TASK_TYPES.join(', ')}`)
      }

      console.log(`\n  Steps (${workflow.TaskStep.length}):`)
      for (const step of workflow.TaskStep) {
        const deps = step.dependsOn as string[]
        console.log(`    ${step.stepIndex + 1}. ${step.name}`)
        console.log(`       Duration: ${step.duration}min | Type: ${step.type} | Async Wait: ${step.asyncWaitTime}min`)
        console.log(`       Status: ${step.status}`)

        // Check for invalid step type
        if (!VALID_TASK_TYPES.includes(step.type)) {
          console.log(`       ⚠️  INVALID TYPE: "${step.type}" - should be one of: ${VALID_TASK_TYPES.join(', ')}`)
        }

        if (deps && deps.length > 0) {
          // Handle case where deps might be a string (JSON)
          const depList = typeof deps === 'string' ? JSON.parse(deps) : deps
          if (depList && depList.length > 0) {
            console.log(`       Dependencies: ${depList.join(', ')}`)
          }
        }
      }
    }

    // Get regular tasks
    const tasks = await prisma.task.findMany({
      where: {
        sessionId: session.id,
        hasSteps: false,
      },
    })

    if (tasks.length > 0) {
      console.log(`\n📝 STANDALONE TASKS (${tasks.length} total):`)
      console.log('-'.repeat(80))

      for (const task of tasks) {
        console.log(`\n${task.completed ? '✅' : '⬜'} ${task.name}`)
        console.log(`  Duration: ${task.duration}min | Type: ${task.type}`)
        console.log(`  Importance: ${task.importance}/10 | Urgency: ${task.urgency}/10`)
        console.log(`  Deadline: ${task.deadline ? format(task.deadline, 'yyyy-MM-dd HH:mm') : 'None'}`)

        if (!VALID_TASK_TYPES.includes(task.type)) {
          console.log(`  ⚠️  WARNING: Invalid type "${task.type}"`)
        }
      }
    }

    // Get scheduled tasks to see what's actually scheduled
    // Note: ScheduledTask doesn't have sessionId, need to join through Task
    const scheduledTasks = await prisma.scheduledTask.findMany({
      where: {
        Task: {
          sessionId: session.id,
        },
      },
      orderBy: { scheduledDate: 'asc' },
      include: {
        Task: true,
      },
    })

    if (scheduledTasks.length > 0) {
      console.log(`\n📅 SCHEDULED ITEMS (${scheduledTasks.length} total):`)
      console.log('-'.repeat(80))

      let currentDate = ''
      for (const st of scheduledTasks) {
        const start = new Date(st.scheduledStartTime)
        const end = new Date(st.scheduledEndTime)
        const dateStr = format(start, 'yyyy-MM-dd')

        // Group by date
        if (dateStr !== currentDate) {
          currentDate = dateStr
          console.log(`\n  ${format(start, 'EEEE, MMM d')}:`)
        }

        console.log(`    ${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}: ${st.taskName}`)
        console.log(`      Type: ${st.type} | Duration: ${st.duration}min`)

        // Check for morning/evening confusion
        const hour = start.getHours()
        if (st.taskName.toLowerCase().includes('evening') ||
            st.taskName.toLowerCase().includes('bedtime') ||
            st.taskName.toLowerCase().includes('sleep')) {
          if (hour < 12) {
            console.log(`      🚨 WARNING: Evening/bedtime task scheduled in morning! (${format(start, 'h:mm a')})`)
          }
        }
      }
    }

    // Get work patterns
    const patterns = await prisma.workPattern.findMany({
      where: {
        sessionId: session.id,
      },
      orderBy: { date: 'asc' },
    })

    if (patterns.length > 0) {
      console.log(`\n⏰ WORK PATTERNS (${patterns.length} total):`)
      console.log('-'.repeat(80))

      for (const pattern of patterns) {
        console.log(`\n  ${format(new Date(pattern.date), 'EEEE, MMM d')}:`)
        const blocks = pattern.pattern as any
        if (blocks?.blocks) {
          for (const block of blocks.blocks) {
            console.log(`    ${block.startTime} - ${block.endTime}: ${block.type}`)
            if (block.capacity) {
              console.log(`      Focus: ${block.capacity.focusMinutes}min | Admin: ${block.capacity.adminMinutes}min`)
            }
          }
        }
      }
    }

    // Summary of issues found
    const invalidTypes = new Set<string>()
    workflows.forEach(w => {
      if (!VALID_TASK_TYPES.includes(w.type)) {
        invalidTypes.add(w.type)
      }
      w.TaskStep.forEach(s => {
        if (!VALID_TASK_TYPES.includes(s.type)) {
          invalidTypes.add(s.type)
        }
      })
    })
    tasks.forEach(t => {
      if (!VALID_TASK_TYPES.includes(t.type)) {
        invalidTypes.add(t.type)
      }
    })

    if (invalidTypes.size > 0) {
      console.log('\n⚠️  ISSUES FOUND:')
      console.log('='.repeat(80))
      console.log(`Invalid task types detected: ${Array.from(invalidTypes).join(', ')}`)
      console.log(`Valid types are: ${VALID_TASK_TYPES.join(', ')}`)
    }

  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
