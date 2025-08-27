#!/usr/bin/env node

/**
 * Script to add test tasks with async wait times and deadlines
 * to demonstrate priority calculation features
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Adding test tasks with async wait times and deadlines...')
  
  // Get the current session
  const session = await prisma.session.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' }
  })
  
  if (!session) {
    console.error('No active session found')
    process.exit(1)
  }
  
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const in3Days = new Date(now.getTime() + 72 * 60 * 60 * 1000)
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  
  // Create test tasks with various async wait times and deadlines
  const testTasks = [
    {
      name: 'TEST: Launch long-running analysis',
      description: 'Start analysis that takes 48 hours',
      duration: 30,
      importance: 8,
      urgency: 9,
      type: 'focused',
      asyncWaitTime: 2880, // 48 hours in minutes
      deadline: in3Days,
      sessionId: session.id,
      completed: false,
      dependencies: [],
      hasSteps: false,
      isAsyncTrigger: true
    },
    {
      name: 'TEST: Submit code for overnight CI',
      description: 'Submit PR that needs overnight CI run',
      duration: 20,
      importance: 7,
      urgency: 8,
      type: 'admin',
      asyncWaitTime: 720, // 12 hours
      deadline: tomorrow,
      sessionId: session.id,
      completed: false,
      dependencies: [],
      hasSteps: false,
      isAsyncTrigger: true
    },
    {
      name: 'TEST: Request data from external team',
      description: 'Send request that typically takes 24h response',
      duration: 15,
      importance: 6,
      urgency: 7,
      type: 'admin',
      asyncWaitTime: 1440, // 24 hours
      deadline: in3Days,
      sessionId: session.id,
      completed: false,
      dependencies: [],
      hasSteps: false,
      isAsyncTrigger: true
    },
    {
      name: 'TEST: Regular task with deadline',
      description: 'Normal task with no async wait',
      duration: 45,
      importance: 8,
      urgency: 8,
      type: 'focused',
      asyncWaitTime: 0,
      deadline: tomorrow,
      sessionId: session.id,
      completed: false,
      dependencies: [],
      hasSteps: false,
      isAsyncTrigger: false
    },
    {
      name: 'TEST: Low priority task',
      description: 'Task with lower priority',
      duration: 30,
      importance: 4,
      urgency: 4,
      type: 'admin',
      asyncWaitTime: 0,
      deadline: nextWeek,
      sessionId: session.id,
      completed: false,
      dependencies: [],
      hasSteps: false,
      isAsyncTrigger: false
    }
  ]
  
  for (const task of testTasks) {
    const created = await prisma.task.create({
      data: task
    })
    console.log(`Created task: ${created.name}`)
    console.log(`  - AsyncWaitTime: ${created.asyncWaitTime} minutes`)
    console.log(`  - Deadline: ${created.deadline}`)
    console.log(`  - Priority: ${created.importance * created.urgency}`)
  }
  
  console.log('\nTest tasks created successfully!')
  console.log('Open the app and check the Scheduling Debug Info to see:')
  console.log('- Async boost for tasks with wait times')
  console.log('- Deadline boost for urgent tasks')
  console.log('- Priority breakdowns explaining scheduling order')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())