#!/usr/bin/env npx tsx
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=' .repeat(80))
  console.log('CHECK hasSteps FLAG ON HALEIGH TASKS')
  console.log('=' .repeat(80))

  // Get Haleigh 9/13 session
  const session = await prisma.session.findFirst({
    where: { name: 'Haleigh 9/13' },
    include: {
      Task: {
        where: { completed: false },
      },
    },
  })

  if (!session) {
    console.error('Session not found!')
    return
  }

  console.log('\n📋 HALEIGH TASKS:')
  session.Task.forEach(task => {
    console.log(`  ${task.name}`)
    console.log(`    hasSteps: ${task.hasSteps}`)
    console.log(`    type: ${task.type}`)
    console.log(`    duration: ${task.duration}min`)
  })

  // Check what gets filtered
  const standaloneTasks = session.Task.filter(t => !t.hasSteps)
  const workflowTasks = session.Task.filter(t => t.hasSteps)

  console.log('\n📊 FILTERING RESULTS:')
  console.log(`  Standalone tasks (will be scheduled): ${standaloneTasks.length}`)
  console.log(`  Workflow tasks (filtered out): ${workflowTasks.length}`)

  if (workflowTasks.length > 0) {
    console.log('\n❌ FILTERED OUT TASKS:')
    workflowTasks.forEach(t => {
      console.log(`  - ${t.name}`)
    })
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
