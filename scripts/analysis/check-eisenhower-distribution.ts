#!/usr/bin/env npx tsx
/**
 * Script to check Eisenhower matrix task distribution
 * Shows importance/urgency values to debug 1D scatter plot issue
 * Usage: npx tsx scripts/check-eisenhower-distribution.ts [session-name]
 */

import { PrismaClient } from '@prisma/client'
import { format } from 'date-fns'

const prisma = new PrismaClient()

async function main(): Promise<void> {
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
      session = await prisma.session.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      })
    }

    if (!session) {
      console.error('❌ No session found')
      process.exit(1)
    }

    console.log('=' .repeat(80))
    console.log('EISENHOWER MATRIX DISTRIBUTION ANALYSIS')
    console.log('=' .repeat(80))
    console.log()
    console.log(`📅 Session: ${session.name}`)
    console.log(`   ID: ${session.id}`)
    console.log(`   Created: ${format(session.createdAt, 'yyyy-MM-dd HH:mm:ss')}`)
    console.log()

    // Get all tasks (not workflows)
    const tasks = await prisma.task.findMany({
      where: {
        sessionId: session.id,
        hasSteps: false,
        completed: false, // Only incomplete tasks show in matrix
      },
      orderBy: [
        { importance: 'desc' },
        { urgency: 'desc' },
      ],
    })

    // Get workflow tasks (those with steps)
    const workflows = await prisma.task.findMany({
      where: {
        sessionId: session.id,
        hasSteps: true,
        completed: false,
      },
      include: {
        TaskStep: true,
      },
    })

    console.log(`📊 TASK DISTRIBUTION (${tasks.length} tasks)`)
    console.log('-'.repeat(80))

    if (tasks.length === 0) {
      console.log('No regular tasks found!')
    } else {
      // Create distribution map
      const distribution: Record<string, number> = {}
      const importanceValues: Record<number, number> = {}
      const urgencyValues: Record<number, number> = {}

      tasks.forEach(task => {
        const key = `${task.importance},${task.urgency}`
        distribution[key] = (distribution[key] || 0) + 1
        importanceValues[task.importance] = (importanceValues[task.importance] || 0) + 1
        urgencyValues[task.urgency] = (urgencyValues[task.urgency] || 0) + 1
      })

      // Show importance distribution
      console.log('\n📈 IMPORTANCE VALUES:')
      for (let i = 10; i >= 1; i--) {
        const count = importanceValues[i] || 0
        const bar = '█'.repeat(count)
        console.log(`  ${String(i).padStart(2)}: ${bar} (${count})`)
      }

      // Show urgency distribution
      console.log('\n📈 URGENCY VALUES:')
      for (let i = 10; i >= 1; i--) {
        const count = urgencyValues[i] || 0
        const bar = '█'.repeat(count)
        console.log(`  ${String(i).padStart(2)}: ${bar} (${count})`)
      }

      // Show 2D grid
      console.log('\n📊 2D DISTRIBUTION GRID:')
      console.log('   (Importance vertical, Urgency horizontal)')
      console.log()
      console.log('    U→  1   2   3   4   5   6   7   8   9  10')
      console.log('  I ┌' + '─'.repeat(43) + '┐')

      for (let imp = 10; imp >= 1; imp--) {
        let row = `  ${String(imp).padStart(2)} │`
        for (let urg = 1; urg <= 10; urg++) {
          const key = `${imp},${urg}`
          const count = distribution[key] || 0
          if (count > 0) {
            row += String(count).padStart(4)
          } else {
            row += '   ·'
          }
        }
        row += ' │'
        console.log(row)
      }
      console.log('     └' + '─'.repeat(43) + '┘')

      // List all tasks with their values
      console.log('\n📋 TASK DETAILS:')
      console.log('-'.repeat(80))
      console.log('Name'.padEnd(40) + ' Imp  Urg  Type')
      console.log('-'.repeat(80))

      tasks.forEach(task => {
        const name = task.name.substring(0, 39).padEnd(40)
        console.log(`${name} ${String(task.importance).padStart(3)}  ${String(task.urgency).padStart(3)}  ${task.type}`)
      })
    }

    // Check workflows
    console.log(`\n📊 WORKFLOW DISTRIBUTION (${workflows.length} workflows)`)
    console.log('-'.repeat(80))

    if (workflows.length === 0) {
      console.log('No workflows found!')
    } else {
      console.log('Name'.padEnd(40) + ' Imp  Urg  Steps')
      console.log('-'.repeat(80))

      workflows.forEach(workflow => {
        const name = workflow.name.substring(0, 39).padEnd(40)
        const stepCount = workflow.TaskStep?.length || 0
        console.log(`${name} ${String(workflow.importance).padStart(3)}  ${String(workflow.urgency).padStart(3)}  ${stepCount}`)
      })
    }

    // Check for data issues
    console.log('\n⚠️  POTENTIAL ISSUES:')
    console.log('-'.repeat(80))

    // Check if all have same importance
    const uniqueImportance = new Set(tasks.map(t => t.importance))
    if (uniqueImportance.size === 1 && tasks.length > 0) {
      console.log(`❌ All tasks have the same importance value: ${[...uniqueImportance][0]}`)
    }

    // Check if all have same urgency
    const uniqueUrgency = new Set(tasks.map(t => t.urgency))
    if (uniqueUrgency.size === 1 && tasks.length > 0) {
      console.log(`❌ All tasks have the same urgency value: ${[...uniqueUrgency][0]}`)
    }

    // Check if Y-axis would be 1D
    const yValues = tasks.map(t => (1 - t.importance / 10) * 100)
    const uniqueY = new Set(yValues)
    if (uniqueY.size === 1 && tasks.length > 0) {
      console.log(`❌ All tasks would have the same Y position: ${[...uniqueY][0]}`)
      console.log('   This would cause a 1D horizontal line!')
    } else if (uniqueY.size < 3 && tasks.length > 3) {
      console.log(`⚠️  Only ${uniqueY.size} unique Y positions for ${tasks.length} tasks`)
      console.log(`   Y positions: ${[...uniqueY].sort((a, b) => a - b).join(', ')}`)
    }

    console.log()
    console.log('=' .repeat(80))

  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
