#!/usr/bin/env npx tsx
/**
 * Script to query and analyze Eisenhower matrix logs from database
 * Helps debug why scatter plot appears 1D
 * Usage: npx tsx scripts/query-eisenhower-logs.ts [hours-back]
 */

import { PrismaClient } from '@prisma/client'
import { format } from 'date-fns'

const prisma = new PrismaClient()

async function main() {
  const hoursBack = parseInt(process.argv[2] || '24')
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000)

  try {
    console.log('=' .repeat(80))
    console.log('EISENHOWER SCATTER PLOT LOG ANALYSIS')
    console.log('=' .repeat(80))
    console.log(`Analyzing logs since: ${format(since, 'yyyy-MM-dd HH:mm:ss')}`)
    console.log()

    // Query activation logs
    const activationLogs = await prisma.log.findMany({
      where: {
        category: 'eisenhower.scatter.activated',
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
    })

    console.log(`📊 SCATTER VIEW ACTIVATIONS (${activationLogs.length} found)`)
    console.log('-'.repeat(80))

    activationLogs.forEach((log, idx) => {
      const data = typeof log.data === 'string' ? JSON.parse(log.data) : log.data
      console.log(`\n[${idx + 1}] ${format(log.timestamp, 'HH:mm:ss')}`)
      console.log(`  Tasks: ${data.taskCount}`)
      console.log(`  Container: ${data.containerSize?.width}x${data.containerSize?.height}`)
      console.log(`  Importance values: ${data.importanceDistribution?.unique?.join(', ')}`)
      console.log(`  Urgency values: ${data.urgencyDistribution?.unique?.join(', ')}`)
      console.log(`  Y positions: ${data.yPositionDistribution?.unique?.map((y: number) => y.toFixed(1)).join(', ')}`)
      console.log(`  Unique Y positions: ${data.yPositionDistribution?.count}`)

      if (data.yPositionDistribution?.count === 1) {
        console.log('  ⚠️  WARNING: All tasks have same Y position!')
      }
    })

    // Query collapsed Y-axis errors
    const collapsedLogs = await prisma.log.findMany({
      where: {
        category: 'eisenhower.scatter.collapsed',
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
    })

    if (collapsedLogs.length > 0) {
      console.log(`\n❌ Y-AXIS COLLAPSE ERRORS (${collapsedLogs.length} found)`)
      console.log('-'.repeat(80))

      collapsedLogs.forEach((log) => {
        const data = typeof log.data === 'string' ? JSON.parse(log.data) : log.data
        console.log(`\n${format(log.timestamp, 'HH:mm:ss')}: ${data.message}`)
        console.log(`  Y Position: ${data.yPosition}`)
        console.log(`  Task Count: ${data.taskCount}`)
        console.log(`  Importance Values: ${data.importanceValues?.join(', ')}`)
      })
    }

    // Query individual task position logs
    const positionLogs = await prisma.log.findMany({
      where: {
        category: 'eisenhower.scatter.position',
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
      take: 100, // Limit to avoid too much output
    })

    console.log(`\n📍 TASK POSITION CALCULATIONS (showing last ${Math.min(100, positionLogs.length)} of ${positionLogs.length})`)
    console.log('-'.repeat(80))

    // Group by unique Y positions
    const yPositionGroups: Record<number, any[]> = {}
    positionLogs.forEach(log => {
      const data = typeof log.data === 'string' ? JSON.parse(log.data) : log.data
      const yPercent = data.yPercent
      if (!yPositionGroups[yPercent]) {
        yPositionGroups[yPercent] = []
      }
      yPositionGroups[yPercent].push(data)
    })

    console.log(`\nUnique Y positions found: ${Object.keys(yPositionGroups).length}`)

    Object.entries(yPositionGroups).forEach(([yPercent, tasks]) => {
      console.log(`\n  Y=${yPercent}% (${tasks.length} tasks):`)
      tasks.slice(0, 3).forEach(task => {
        console.log(`    - "${task.taskName}" (imp=${task.importance}, calc: ${task.calculation?.step4})`)
      })
      if (tasks.length > 3) {
        console.log(`    ... and ${tasks.length - 3} more`)
      }
    })

    // Check for data type issues
    console.log('\n🔍 DATA TYPE ANALYSIS')
    console.log('-'.repeat(80))

    const typeIssues = positionLogs.filter(log => {
      const data = typeof log.data === 'string' ? JSON.parse(log.data) : log.data
      return data.importanceType !== 'number' ||
             data.urgencyType !== 'number' ||
             data.isNaN?.importance ||
             data.isNaN?.urgency ||
             data.isNaN?.yPercent
    })

    if (typeIssues.length > 0) {
      console.log(`⚠️  Found ${typeIssues.length} logs with data type issues:`)
      typeIssues.slice(0, 5).forEach(log => {
        const data = typeof log.data === 'string' ? JSON.parse(log.data) : log.data
        console.log(`  - ${data.taskName}:`)
        console.log(`    importance type: ${data.importanceType}, value: ${data.importance}`)
        console.log(`    urgency type: ${data.urgencyType}, value: ${data.urgency}`)
        console.log(`    NaN issues: ${JSON.stringify(data.isNaN)}`)
      })
    } else {
      console.log('✅ No data type issues found')
    }

    // Summary
    console.log('\n📊 SUMMARY')
    console.log('-'.repeat(80))
    console.log(`Total activations: ${activationLogs.length}`)
    console.log(`Y-axis collapses: ${collapsedLogs.length}`)
    console.log(`Position logs: ${positionLogs.length}`)
    console.log(`Unique Y positions: ${Object.keys(yPositionGroups).length}`)

    if (Object.keys(yPositionGroups).length === 1 && positionLogs.length > 1) {
      console.log('\n❌ PROBLEM CONFIRMED: All tasks have the same Y position!')
      const yPos = Object.keys(yPositionGroups)[0]
      const samples = yPositionGroups[yPos].slice(0, 5)
      console.log(`\nAll tasks are at Y=${yPos}%`)
      console.log('Sample importance values:')
      samples.forEach(s => {
        console.log(`  ${s.taskName}: importance=${s.importance}`)
      })
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
