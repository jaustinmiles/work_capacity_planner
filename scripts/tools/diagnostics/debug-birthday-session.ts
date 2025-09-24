#!/usr/bin/env npx tsx
/**
 * Debug Birthday session scheduling issue
 * Diagnoses why tasks aren't being scheduled despite available capacity
 */

import { PrismaClient } from '@prisma/client'
import { calculateBlockCapacity } from '../../../src/shared/capacity-calculator'

const prisma = new PrismaClient()

async function debugSession() {
  console.log('================================================================================')
  console.log('BIRTHDAY SESSION SCHEDULING DIAGNOSTIC')
  console.log('================================================================================')
  console.log(`Current Time: ${new Date().toISOString()}`)
  console.log(`Local Time: ${new Date().toLocaleString()}`)
  console.log('')

  // 1. Find active session
  const activeSession = await prisma.session.findFirst({
    where: { isActive: true },
  })

  console.log('📅 ACTIVE SESSION:')
  console.log(`  Name: ${activeSession?.name || 'NONE'}`)
  console.log(`  ID: ${activeSession?.id || 'NONE'}`)
  console.log('')

  if (!activeSession) {
    console.error('❌ No active session found!')
    return
  }

  // 2. Get today's work pattern (using local date, not UTC)
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const today = `${year}-${month}-${day}`
  console.log(`📆 CHECKING WORK PATTERN FOR: ${today} (local date)`)

  const pattern = await prisma.workPattern.findFirst({
    where: {
      sessionId: activeSession.id,
      date: today,
    },
    include: {
      WorkBlock: true,
      WorkMeeting: true,
    },
  })

  if (!pattern) {
    console.error(`❌ No work pattern found for ${today}`)
    return
  }

  console.log('✅ Work Pattern Found:')
  console.log(`  ID: ${pattern.id}`)
  console.log(`  Date: ${pattern.date}`)
  console.log(`  Blocks: ${pattern.WorkBlock.length}`)
  console.log(`  Meetings: ${pattern.WorkMeeting.length}`)
  console.log('')

  // 3. Analyze each work block
  console.log('📊 WORK BLOCKS ANALYSIS:')
  console.log('================================================================================')

  for (const block of pattern.WorkBlock) {
    console.log(`\n🎯 Block: ${block.id}`)
    console.log(`  Time: ${block.startTime} - ${block.endTime}`)
    console.log(`  Type: ${block.type}`)
    console.log(`  Total Capacity: ${block.totalCapacity} minutes`)
    console.log(`  Split Ratio: ${block.splitRatio}`)

    // Calculate capacity using the same function as the app
    const capacity = calculateBlockCapacity(
      block.type,
      block.startTime,
      block.endTime,
      block.splitRatio,
    )

    console.log('  Calculated Capacity:')
    console.log(`    Focus: ${capacity.focus || 0} minutes`)
    console.log(`    Admin: ${capacity.admin || 0} minutes`)
    console.log(`    Personal: ${capacity.personal || 0} minutes`)

    if ((capacity as any).total !== undefined) {
      console.log(`    Total (flexible): ${(capacity as any).total} minutes`)
    }

    console.log(`    Is Flexible: ${capacity.flexible || false}`)

    // Check if block is currently active
    const now = new Date()
    const currentTimeStr = now.toTimeString().slice(0, 5)
    if (currentTimeStr >= block.startTime && currentTimeStr <= block.endTime) {
      console.log('  ⚡ THIS BLOCK IS CURRENTLY ACTIVE')

      // Calculate remaining time
      const [endHours, endMinutes] = block.endTime.split(':').map(Number)
      const endTime = new Date()
      endTime.setHours(endHours, endMinutes, 0, 0)
      const remainingMinutes = Math.floor((endTime.getTime() - now.getTime()) / 60000)
      console.log(`  ⏰ Remaining time in block: ${remainingMinutes} minutes`)
    }
  }

  // 4. Get tasks AND workflows that need scheduling
  console.log('\n📋 TASKS AND WORKFLOWS NEEDING SCHEDULING:')
  console.log('================================================================================')

  // Check regular tasks
  const tasks = await prisma.task.findMany({
    where: {
      sessionId: activeSession.id,
      completed: false,
    },
  })

  console.log(`Found ${tasks.length} regular tasks`)

  // Check workflows
  const workflows = await prisma.workflow.findMany({
    where: {
      sessionId: activeSession.id,
    },
    include: {
      steps: true,
    },
  })

  console.log(`Found ${workflows.length} workflows`)

  // Show workflows
  if (workflows.length > 0) {
    console.log('\n🔄 WORKFLOWS:')
    for (const workflow of workflows.slice(0, 3)) {
      console.log(`\n  📦 ${workflow.name}`)
      console.log(`    Steps: ${workflow.steps.length}`)
      console.log(`    Status: ${workflow.status}`)

      // Show first few steps
      for (const step of workflow.steps.slice(0, 3)) {
        console.log(`      - ${step.name} (${step.duration}min, status: ${step.status})`)
      }
    }
  }

  console.log(`\nTotal items needing scheduling: ${tasks.length} tasks + ${workflows.length} workflows`)

  // Show first few tasks
  const tasksToShow = tasks.slice(0, 5)
  for (const task of tasksToShow) {
    console.log(`\n  📌 ${task.name}`)
    console.log(`    Duration: ${task.duration} minutes`)
    console.log(`    Type: ${task.type}`)
    console.log(`    Priority: ${task.importance * task.urgency}`)

    if (task.Project) {
      console.log(`    Part of Project: ${task.Project.name}`)
    }
  }

  if (tasks.length > 5) {
    console.log(`\n  ... and ${tasks.length - 5} more tasks`)
  }

  // 5. Summary
  console.log('\n📊 SUMMARY:')
  console.log('================================================================================')

  const totalFocusCapacity = pattern.WorkBlock.reduce((sum, block) => {
    const cap = calculateBlockCapacity(block.type, block.startTime, block.endTime, block.splitRatio)
    return sum + (cap.focus || 0) + ((cap as any).total || 0)
  }, 0)

  const totalTaskMinutes = tasks.reduce((sum, task) => sum + task.duration, 0)

  console.log(`Total Focus Capacity Available: ${totalFocusCapacity} minutes`)
  console.log(`Total Task Minutes Needed: ${totalTaskMinutes} minutes`)
  console.log(`Capacity vs Demand: ${totalFocusCapacity - totalTaskMinutes} minutes ${
    totalFocusCapacity >= totalTaskMinutes ? 'surplus ✅' : 'deficit ❌'
  }`)

  // 6. Potential Issues
  console.log('\n⚠️ POTENTIAL ISSUES:')
  console.log('================================================================================')

  if (pattern.WorkBlock.length === 0) {
    console.error('❌ No work blocks defined for today!')
  }

  const flexibleBlocks = pattern.WorkBlock.filter(b => b.type === 'flexible')
  if (flexibleBlocks.length > 0) {
    console.warn(`⚠️ Found ${flexibleBlocks.length} flexible blocks - check if capacity.total is being read correctly`)
  }

  const focusedBlocks = pattern.WorkBlock.filter(b => b.type === 'focused')
  if (focusedBlocks.length === 0 && tasks.some(t => t.type === 'focused')) {
    console.error('❌ No focused blocks but have focused tasks!')
  }

  const blocksWithZeroCapacity = pattern.WorkBlock.filter(b => b.totalCapacity === 0)
  if (blocksWithZeroCapacity.length > 0) {
    console.error(`❌ ${blocksWithZeroCapacity.length} blocks have 0 total capacity!`)
  }

  await prisma.$disconnect()
}

debugSession().catch(console.error)
