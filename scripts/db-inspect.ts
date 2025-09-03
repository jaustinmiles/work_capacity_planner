#!/usr/bin/env npx tsx
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { PrismaClient } from '@prisma/client'
import { format } from 'date-fns'

const prisma = new PrismaClient()

async function inspectSession(sessionName?: string) {
  console.log('='.repeat(80))
  console.log('DATABASE INSPECTION TOOL')
  console.log('='.repeat(80))

  // Get the session
  let session
  if (sessionName) {
    session = await prisma.session.findFirst({
      where: { name: { contains: sessionName } },
      orderBy: { createdAt: 'desc' },
    })
  } else {
    session = await prisma.session.findFirst({
      orderBy: { createdAt: 'desc' },
    })
  }

  if (!session) {
    console.error('No session found')
    process.exit(1)
  }

  console.log('\n📅 SESSION DETAILS:')
  console.log(`- Name: ${session.name}`)
  console.log(`- ID: ${session.id}`)
  console.log(`- Current: ${session.isCurrent}`)
  console.log(`- Created: ${format(session.createdAt, 'yyyy-MM-dd HH:mm:ss')}`)

  // Get tasks for this session
  const tasks = await prisma.task.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`\n📋 TASKS (${tasks.length} total):`)
  console.log('-'.repeat(80))

  for (const task of tasks) {
    const deadlineStr = task.deadline ? format(task.deadline, 'yyyy-MM-dd HH:mm') : 'None'
    const completedStr = task.completed ? '✅' : '❌'
    console.log(`${completedStr} ${task.name}`)
    console.log(`   Duration: ${task.duration}min | Priority: ${task.priority || 'N/A'}`)
    console.log(`   Deadline: ${deadlineStr} (${task.deadlineType || 'soft'})`)
    console.log(`   Type: ${task.type} | Cognitive: ${task.cognitiveComplexity}`)
    if (task.dependencies && Array.isArray(task.dependencies) && task.dependencies.length > 0) {
      console.log(`   Dependencies: ${task.dependencies.join(', ')}`)
    }
    if (task.isAsyncTrigger) {
      console.log(`   🔄 Async Trigger (wait time: ${task.asyncWaitTime}min)`)
    }
    console.log('')
  }

  // Get workflows for this session
  const workflows = await prisma.sequencedTask.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: 'asc' },
  })

  if (workflows.length > 0) {
    console.log(`\n🔗 WORKFLOWS (${workflows.length} total):`)
    console.log('-'.repeat(80))

    for (const workflow of workflows) {
      const deadlineStr = workflow.deadline ? format(workflow.deadline, 'yyyy-MM-dd HH:mm') : 'None'
      const completedStr = workflow.completed ? '✅' : '❌'
      console.log(`${completedStr} ${workflow.name}`)
      console.log(`   Steps: ${workflow.steps?.length || 0} | Priority: ${workflow.priority || 'N/A'}`)
      console.log(`   Deadline: ${deadlineStr}`)
      if (workflow.steps && workflow.steps.length > 0) {
        console.log('   Steps:')
        for (const step of workflow.steps as any[]) {
          console.log(`     - ${step.name} (${step.duration}min) - ${step.status}`)
        }
      }
      console.log('')
    }
  }

  // Get work blocks
  const workBlocks = await prisma.workBlock.findMany({
    where: {
      date: {
        gte: format(new Date(), 'yyyy-MM-dd'),
        lte: format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
      },
    },
    orderBy: { date: 'asc' },
  })

  console.log('\n🕐 WORK BLOCKS (next 7 days):')
  console.log('-'.repeat(80))

  for (const block of workBlocks) {
    console.log(`${block.date}: ${block.startTime} - ${block.endTime}`)
    console.log(`   Type: ${block.type} | Session: ${block.sessionId || 'None'}`)
    if (block.tasks && Array.isArray(block.tasks)) {
      console.log(`   Tasks: ${(block.tasks as any[]).map(t => t.name).join(', ')}`)
    }
    console.log('')
  }

  // Get meetings
  const meetings = await prisma.meeting.findMany({
    where: {
      date: {
        gte: format(new Date(), 'yyyy-MM-dd'),
        lte: format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
      },
    },
    orderBy: { startTime: 'asc' },
  })

  if (meetings.length > 0) {
    console.log('\n📅 MEETINGS (next 7 days):')
    console.log('-'.repeat(80))

    for (const meeting of meetings) {
      const startStr = format(meeting.startTime, 'yyyy-MM-dd HH:mm')
      const endStr = format(meeting.endTime, 'HH:mm')
      console.log(`${meeting.title}: ${startStr} - ${endStr}`)
      console.log('')
    }
  }

  console.log('='.repeat(80))
}

// Get session name from command line arguments
const sessionName = process.argv[2]

inspectSession(sessionName)
  .catch(console.error)
  .finally(() => prisma.$disconnect())
