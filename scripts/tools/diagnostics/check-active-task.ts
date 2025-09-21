#!/usr/bin/env npx tsx
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=' .repeat(80))
  console.log('CHECK ACTIVE WORK SESSION TASK')
  console.log('=' .repeat(80))

  // Get the active work session
  const activeWorkSession = await prisma.workSession.findFirst({
    where: {
      endTime: null,
    },
    include: {
      Task: {
        include: {
          Session: true,
        },
      },
    },
  })

  if (!activeWorkSession) {
    console.log('❌ No active work session')
    return
  }

  console.log('\n🏃 ACTIVE WORK SESSION:')
  console.log(`  ID: ${activeWorkSession.id}`)
  console.log(`  Task ID: ${activeWorkSession.taskId}`)
  console.log(`  Started: ${activeWorkSession.startTime.toISOString()}`)
  console.log(`  Is Paused: ${activeWorkSession.isPaused}`)

  if (activeWorkSession.Task) {
    console.log('\n📋 TASK DETAILS:')
    console.log(`  Name: ${activeWorkSession.Task.name}`)
    console.log(`  Session: ${activeWorkSession.Task.Session?.name} (${activeWorkSession.Task.sessionId})`)
    console.log(`  Completed: ${activeWorkSession.Task.completed}`)

    console.log('\n⚠️ ISSUE FOUND:')
    if (activeWorkSession.Task.sessionId !== 'c909770d-ebce-43a9-a32b-25d5bd8bcbea') {
      console.log('  This task is from a DIFFERENT session!')
      console.log('  Active session: Haleigh 9/13 (c909770d-ebce-43a9-a32b-25d5bd8bcbea)')
      console.log(`  Task session: ${activeWorkSession.Task.Session?.name} (${activeWorkSession.Task.sessionId})`)
    }

    if (activeWorkSession.Task.completed) {
      console.log('  This task is marked as COMPLETED but still has active session!')
    }
  } else {
    console.log('\n❌ Task not found for ID:', activeWorkSession.taskId)
  }

  console.log('\n💡 SOLUTION:')
  console.log('  Need to end this work session before starting Haleigh tasks')
  console.log('  OR switch to the session that contains this task')
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
