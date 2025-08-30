#!/usr/bin/env npx tsx
/**
 * Script to check scheduled tasks and identify scheduling issues
 * Usage: npx tsx scripts/check-scheduled-tasks.ts [session-name]
 */

import { PrismaClient } from '@prisma/client'
import { format } from 'date-fns'

const prisma = new PrismaClient()

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
    console.log('SCHEDULED TASKS INSPECTION')
    console.log('='.repeat(80))

    console.log('\n📅 SESSION:')
    console.log(`  Name: ${session.name}`)
    console.log(`  ID: ${session.id}`)
    console.log(`  Created: ${format(session.createdAt, 'yyyy-MM-dd HH:mm:ss')}`)

    // Get scheduled tasks for this session's tasks
    const scheduledTasks = await prisma.scheduledTask.findMany({
      where: {
        Task: {
          sessionId: session.id,
        },
      },
      orderBy: { scheduledStartTime: 'asc' },
      include: {
        Task: true,
      },
    })

    if (scheduledTasks.length === 0) {
      console.log('\n⚠️  No scheduled tasks found for this session')
      process.exit(0)
    }

    console.log(`\n📅 SCHEDULED ITEMS (${scheduledTasks.length} total):`)
    console.log('-'.repeat(80))

    let currentDate = ''
    const issues: string[] = []

    for (const st of scheduledTasks) {
      const start = new Date(st.scheduledStartTime)
      const end = new Date(st.scheduledEndTime)
      const dateStr = format(start, 'yyyy-MM-dd')

      // Group by date
      if (dateStr !== currentDate) {
        currentDate = dateStr
        console.log(`\n  ${format(start, 'EEEE, MMM d, yyyy')}:`)
      }

      console.log(`    ${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}: ${st.taskName}`)
      console.log(`      Type: ${st.type} | Duration: ${st.duration}min`)
      if (st.stepId) {
        console.log(`      Step ID: ${st.stepId}`)
      }
      console.log(`      Raw start time: ${st.scheduledStartTime}`)
      console.log(`      Raw end time: ${st.scheduledEndTime}`)

      // Check for morning/evening confusion
      const hour = start.getHours()
      const taskNameLower = st.taskName.toLowerCase()

      // Check for evening/bedtime tasks scheduled in morning
      if (taskNameLower.includes('evening') ||
          taskNameLower.includes('bedtime') ||
          taskNameLower.includes('sleep') ||
          taskNameLower.includes('wind down')) {
        if (hour < 12) {
          const issue = `Evening/bedtime task "${st.taskName}" scheduled in morning at ${format(start, 'h:mm a')}`
          issues.push(issue)
          console.log(`      🚨 WARNING: ${issue}`)
        }
      }

      // Check for morning tasks scheduled in evening
      if (taskNameLower.includes('morning') ||
          taskNameLower.includes('wake') ||
          taskNameLower.includes('breakfast')) {
        if (hour >= 18) {
          const issue = `Morning task "${st.taskName}" scheduled in evening at ${format(start, 'h:mm a')}`
          issues.push(issue)
          console.log(`      🚨 WARNING: ${issue}`)
        }
      }

      // Check for tasks crossing midnight
      if (end.getDate() !== start.getDate()) {
        const issue = `Task "${st.taskName}" crosses midnight boundary (starts ${format(start, 'MMM d')} ends ${format(end, 'MMM d')})`
        issues.push(issue)
        console.log(`      ⚠️  WARNING: ${issue}`)
      }
    }

    // Check for workflow coherence - if steps from the same workflow are split across times
    const workflowSteps = scheduledTasks.filter(st => st.stepId !== null)
    if (workflowSteps.length > 0) {
      // Group by workflow (using task ID since steps share parent task)
      const byWorkflow = new Map<string, typeof workflowSteps>()
      for (const step of workflowSteps) {
        const taskId = step.taskId
        if (!byWorkflow.has(taskId)) {
          byWorkflow.set(taskId, [])
        }
        byWorkflow.get(taskId)!.push(step)
      }

      // Check each workflow for time gaps
      for (const [taskId, steps] of byWorkflow) {
        if (steps.length > 1) {
          const times = steps.map(s => new Date(s.scheduledStartTime).getTime())
          const minTime = Math.min(...times)
          const maxTime = Math.max(...times)
          const gap = maxTime - minTime
          const gapHours = gap / (1000 * 60 * 60)

          if (gapHours > 3) {
            const workflowName = steps[0].Task?.name || steps[0].taskName
            const issue = `Workflow "${workflowName}" has steps spread over ${gapHours.toFixed(1)} hours`
            issues.push(issue)
            console.log(`\n⚠️  WORKFLOW COHERENCE: ${issue}`)
            for (const step of steps) {
              console.log(`    - ${format(new Date(step.scheduledStartTime), 'HH:mm')}: ${step.taskName}`)
            }
          }
        }
      }
    }

    if (issues.length > 0) {
      console.log('\n🚨 SCHEDULING ISSUES FOUND:')
      console.log('='.repeat(80))
      issues.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue}`)
      })
    } else {
      console.log('\n✅ No obvious scheduling issues detected')
    }

  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
