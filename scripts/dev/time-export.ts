#!/usr/bin/env npx tsx
/**
 * Export time logging data for development dogfooding
 * Usage: npx tsx scripts/dev/time-export.ts [workflow-id]
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface TimeBreakdown {
  taskName: string
  totalMinutes: number
  sessions: Array<{
    stepName?: string
    minutes: number
    timestamp: string
  }>
}

async function exportTimeData(workflowId?: string) {
  try {
    console.log('🕐 Development Time Export')
    console.log('=' .repeat(50))

    // Get time logged on workflows/tasks
    const sessions = await prisma.workSession.findMany({
      include: {
        step: {
          include: {
            task: true,
          },
        },
      },
      where: workflowId ? {
        step: {
          taskId: workflowId,
        },
      } : undefined,
      orderBy: {
        startTime: 'asc',
      },
    })

    const breakdown = new Map<string, TimeBreakdown>()

    sessions.forEach(session => {
      const taskName = session.step?.task?.name || 'Unknown Task'
      const stepName = session.step?.name
      const minutes = session.duration

      if (!breakdown.has(taskName)) {
        breakdown.set(taskName, {
          taskName,
          totalMinutes: 0,
          sessions: [],
        })
      }

      const taskBreakdown = breakdown.get(taskName)!
      taskBreakdown.totalMinutes += minutes
      taskBreakdown.sessions.push({
        stepName,
        minutes,
        timestamp: session.startTime.toISOString(),
      })
    })

    // Print summary
    let grandTotal = 0
    breakdown.forEach(task => {
      grandTotal += task.totalMinutes
      const hours = Math.floor(task.totalMinutes / 60)
      const mins = task.totalMinutes % 60

      console.log(`\n📋 ${task.taskName}`)
      console.log(`   Total: ${hours}h ${mins}m`)

      task.sessions.forEach(session => {
        const sessionHours = Math.floor(session.minutes / 60)
        const sessionMins = session.minutes % 60
        const date = new Date(session.timestamp).toLocaleDateString()

        if (session.stepName) {
          console.log(`   ↳ ${session.stepName}: ${sessionHours}h ${sessionMins}m (${date})`)
        } else {
          console.log(`   ↳ ${sessionHours}h ${sessionMins}m (${date})`)
        }
      })
    })

    const totalHours = Math.floor(grandTotal / 60)
    const totalMins = grandTotal % 60

    console.log('\n' + '='.repeat(50))
    console.log(`📊 TOTAL TIME: ${totalHours}h ${totalMins}m`)
    console.log('='.repeat(50))

  } catch (error) {
    console.error('❌ Error exporting time data:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run export
const workflowId = process.argv[2]
exportTimeData(workflowId)
