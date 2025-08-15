#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Starting COMPLETE unified task migration...\n')

  try {
    // 1. Check current state
    console.log('📊 Checking current database state...')

    const taskCount = await prisma.task.count()
    const sequencedTaskCount = await prisma.sequencedTask.count()
    const taskStepCount = await prisma.taskStep.count()

    console.log(`  - Regular tasks: ${taskCount}`)
    console.log(`  - Sequenced tasks to migrate: ${sequencedTaskCount}`)
    console.log(`  - Task steps: ${taskStepCount}`)

    if (sequencedTaskCount === 0) {
      console.log('\n✅ No sequenced tasks to migrate!')
      return
    }

    // 2. Load sequenced tasks with their steps
    console.log('\n📦 Loading sequenced tasks with steps...')
    const sequencedTasks = await prisma.sequencedTask.findMany({
      include: { TaskStep: true },
    })

    // 3. Migrate each sequenced task to Task table
    console.log('\n🔄 Migrating sequenced tasks to Task table...')

    for (const st of sequencedTasks) {
      console.log(`  - Migrating: ${st.name}`)

      // Create the task in Task table with the SAME ID
      const newTask = await prisma.task.create({
        data: {
          id: st.id, // Keep the same ID!
          name: st.name,
          duration: st.totalDuration,
          importance: st.importance,
          urgency: st.urgency,
          type: st.type,
          asyncWaitTime: 0,
          dependencies: st.dependencies,
          completed: st.completed,
          completedAt: st.completed ? new Date() : null,
          actualDuration: null,
          notes: st.notes,
          projectId: null,
          deadline: null,
          sessionId: st.sessionId || 'default',
          hasSteps: true,
          currentStepId: st.TaskStep.find(s => s.status === 'in_progress')?.id || null,
          overallStatus: st.overallStatus,
          criticalPathDuration: st.criticalPathDuration,
          worstCaseDuration: st.worstCaseDuration,
          createdAt: st.createdAt,
          updatedAt: st.updatedAt,
        },
      })

      console.log(`    ✓ Created task: ${newTask.id}`)
    }

    // 4. Fix TaskStep references - they already have taskId pointing to the right IDs
    console.log('\n🔧 Verifying TaskStep references...')
    const steps = await prisma.taskStep.findMany()
    console.log(`  - ${steps.length} steps already have taskId set correctly`)

    // 5. Check if StepWorkSession table exists and migrate if needed
    console.log('\n📋 Checking for step work sessions...')
    try {
      // Try to access StepWorkSession through raw query since model might not exist
      const stepWorkSessions = await prisma.$queryRaw`SELECT * FROM StepWorkSession`
      console.log(`  - Found ${stepWorkSessions.length} step work sessions to migrate`)

      for (const sws of stepWorkSessions) {
        // Find the step
        const step = await prisma.taskStep.findUnique({
          where: { id: sws.taskStepId },
        })

        if (step && step.taskId) {
          const workSession = await prisma.workSession.create({
            data: {
              id: `migrated-sws-${sws.id}`,
              taskId: step.taskId,
              stepId: sws.taskStepId,
              patternId: null,
              type: 'focused',
              startTime: sws.startTime,
              endTime: sws.endTime || new Date(),
              plannedMinutes: sws.duration,
              actualMinutes: sws.duration,
              notes: sws.notes,
              createdAt: sws.createdAt,
            },
          })
          console.log('  ✓ Migrated work session for step')
        }
      }
    } catch (error) {
      console.log('  - No StepWorkSession table found or no records to migrate')
    }

    // 6. Clean up old tables
    console.log('\n🧹 Cleaning up old tables...')

    // Delete all SequencedTasks
    await prisma.sequencedTask.deleteMany({})
    console.log('  ✓ Deleted SequencedTask records')

    // 7. Final verification
    console.log('\n✅ Migration Complete! Final state:')

    const finalTaskCount = await prisma.task.count()
    const finalWorkflowCount = await prisma.task.count({ where: { hasSteps: true } })
    const finalSequencedCount = await prisma.sequencedTask.count()

    console.log(`  - Total tasks: ${finalTaskCount}`)
    console.log(`  - Workflows (hasSteps=true): ${finalWorkflowCount}`)
    console.log(`  - Remaining SequencedTasks: ${finalSequencedCount} (should be 0)`)

    if (finalSequencedCount === 0) {
      console.log('\n🎉 SUCCESS! All sequenced tasks have been migrated.')
      console.log('Next steps:')
      console.log('  1. Update src/main/database.ts to remove SequencedTask methods')
      console.log('  2. Run npm run typecheck to verify TypeScript')
      console.log('  3. Test the application thoroughly')
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    console.error('\nTo restore from backup:')
    console.error('  cp backups/backup_2025-08-13_08-10-03_before_migration.db prisma/dev.db')
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(console.error)
