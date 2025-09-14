#!/usr/bin/env npx tsx
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=' .repeat(80))
  console.log('VERIFY ROOT CAUSE - SYSTEMATIC CHECK')
  console.log('=' .repeat(80))

  // 1. Check if ending the stale session would help
  const staleSession = await prisma.workSession.findFirst({
    where: { endTime: null },
  })

  console.log('\n1️⃣ STALE WORK SESSION:')
  if (staleSession) {
    console.log('  ✅ Found stale session from', staleSession.startTime.toLocaleDateString())
    console.log('  Task ID:', staleSession.taskId)
    console.log('  This MIGHT block starting new tasks if the app checks for active sessions')
  } else {
    console.log('  ❌ No stale session found')
  }

  // 2. Simulate what happens if we fix hasSteps
  const haleighTasks = await prisma.task.findMany({
    where: {
      sessionId: 'c909770d-ebce-43a9-a32b-25d5bd8bcbea',
      completed: false,
    },
  })

  console.log('\n2️⃣ HASSTEPS FILTERING:')
  const withSteps = haleighTasks.filter(t => t.hasSteps)
  const withoutSteps = haleighTasks.filter(t => !t.hasSteps)
  console.log(`  Tasks with hasSteps=true: ${withSteps.length} (${withSteps.reduce((sum, t) => sum + t.duration, 0)} min)`)
  console.log(`  Tasks with hasSteps=false: ${withoutSteps.length} (${withoutSteps.reduce((sum, t) => sum + t.duration, 0)} min)`)
  console.log('  If adapter filters by hasSteps, only', withoutSteps.length, 'tasks would be scheduled')

  // 3. Check if any scheduled tasks exist in database
  console.log('\n3️⃣ SCHEDULED TASKS TABLE:')
  const scheduledCount = await prisma.scheduledTask.count()
  console.log('  Total scheduled tasks in DB:', scheduledCount)

  // 4. Test if the scheduling service would work with minimal input
  console.log('\n4️⃣ SCHEDULING SERVICE TEST:')
  console.log('  Would need to test with actual SchedulingService...')
  console.log('  But we know it crashes with undefined.split() error')

  // 5. Check what getNextScheduledItem needs
  console.log('\n5️⃣ WHAT getNextScheduledItem() NEEDS:')
  console.log('  1. generateSchedule() must succeed (currently crashes)')
  console.log('  2. currentSchedule must be set in store')
  console.log('  3. scheduledItems array must have items')
  console.log('  4. Items must not be completed')

  console.log('\n🎯 MOST LIKELY ROOT CAUSE:')
  console.log('  The scheduler CRASHES before any tasks can be scheduled')
  console.log('  This makes getNextScheduledItem() return null')
  console.log('  Which shows "No tasks available" in UI')

  console.log('\n🔧 TO TEST THE FIX:')
  console.log('  1. Fix the undefined.split() crash in scheduler')
  console.log('  2. Fix hasSteps filtering (380 min of tasks being filtered)')
  console.log('  3. End stale work session (may or may not be blocking)')
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
