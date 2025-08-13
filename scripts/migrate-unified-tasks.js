#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Starting unified task migration...\n')
  
  try {
    // 1. Backup database first
    console.log('📸 Creating backup before migration...')
    require('./backup-db.js')
    
    // 2. Get all data we need to migrate
    console.log('\n📊 Loading data to migrate...')
    
    const sessions = await prisma.session.findMany()
    const tasks = await prisma.task.findMany()
    const sequencedTasks = await prisma.sequencedTask.findMany({
      include: { steps: true }
    })
    const stepWorkSessions = await prisma.stepWorkSession.findMany()
    const workSessions = await prisma.workSession.findMany()
    
    console.log(`  - ${sessions.length} sessions`)
    console.log(`  - ${tasks.length} regular tasks`)
    console.log(`  - ${sequencedTasks.length} workflows`)
    console.log(`  - ${stepWorkSessions.length} step work sessions`)
    console.log(`  - ${workSessions.length} regular work sessions`)
    
    // 3. Create migration data
    console.log('\n🔄 Preparing migration data...')
    
    // Map to track old sequencedTask IDs to new task IDs
    const sequencedTaskIdMap = new Map()
    
    // Prepare new tasks from sequenced tasks
    const newTasksFromSequenced = sequencedTasks.map(st => {
      const newId = `migrated-${st.id}`
      sequencedTaskIdMap.set(st.id, newId)
      
      return {
        id: newId,
        name: st.name,
        duration: st.totalDuration,
        importance: st.importance,
        urgency: st.urgency,
        type: st.type,
        asyncWaitTime: 0,
        dependencies: st.dependencies,
        completed: st.completed,
        completedAt: st.completed ? new Date() : null,
        actualDuration: st.steps.reduce((sum, step) => sum + (step.actualDuration || 0), 0) || null,
        notes: st.notes,
        projectId: null,
        deadline: null,
        sessionId: st.sessionId,
        hasSteps: true,
        currentStepId: st.steps.find(s => s.status === 'in_progress')?.id || null,
        overallStatus: st.overallStatus,
        criticalPathDuration: st.criticalPathDuration,
        worstCaseDuration: st.worstCaseDuration,
        createdAt: st.createdAt,
        updatedAt: st.updatedAt
      }
    })
    
    // Update regular tasks to new format
    const updatedTasks = tasks.map(task => ({
      ...task,
      hasSteps: false,
      currentStepId: null,
      overallStatus: task.completed ? 'completed' : 'not_started',
      criticalPathDuration: task.duration,
      worstCaseDuration: task.duration
    }))
    
    // Prepare steps with new taskId references
    const migratedSteps = []
    sequencedTasks.forEach(st => {
      const newTaskId = sequencedTaskIdMap.get(st.id)
      st.steps.forEach(step => {
        migratedSteps.push({
          ...step,
          taskId: newTaskId,
          sequencedTaskId: undefined
        })
      })
    })
    
    // Prepare unified work sessions
    const unifiedWorkSessions = [
      // Keep existing work sessions
      ...workSessions.map(ws => ({
        ...ws,
        stepId: null,
        actualMinutes: ws.actualMinutes || ws.plannedMinutes
      })),
      // Convert step work sessions
      ...stepWorkSessions.map(sws => {
        // Find which task this step belongs to
        const step = migratedSteps.find(s => s.id === sws.taskStepId)
        const taskId = step ? step.taskId : null
        
        return {
          id: `step-${sws.id}`,
          taskId: taskId,
          stepId: sws.taskStepId,
          patternId: null,
          type: step?.type || 'focused',
          startTime: sws.startTime,
          endTime: sws.endTime,
          plannedMinutes: sws.duration,
          actualMinutes: sws.duration,
          notes: sws.notes,
          createdAt: sws.createdAt
        }
      }).filter(ws => ws.taskId) // Only keep sessions we can link to a task
    ]
    
    // 4. Write migration SQL
    console.log('\n📝 Writing migration SQL...')
    
    const migrationPath = path.join(__dirname, '..', 'prisma', 'migrations', 'unified_tasks_migration')
    if (!fs.existsSync(migrationPath)) {
      fs.mkdirSync(migrationPath, { recursive: true })
    }
    
    // Create migration report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        sessionsCount: sessions.length,
        originalTasksCount: tasks.length,
        sequencedTasksCount: sequencedTasks.length,
        totalTasksAfter: tasks.length + sequencedTasks.length,
        stepsCount: migratedSteps.length,
        workSessionsCount: unifiedWorkSessions.length
      },
      sequencedTaskMapping: Object.fromEntries(sequencedTaskIdMap),
      migratedData: {
        newTasksFromSequenced,
        updatedTasks,
        migratedSteps,
        unifiedWorkSessions
      }
    }
    
    fs.writeFileSync(
      path.join(migrationPath, 'migration-report.json'),
      JSON.stringify(report, null, 2)
    )
    
    console.log('✅ Migration preparation complete!')
    console.log('\n📋 Migration Summary:')
    console.log(`  - ${tasks.length} regular tasks will be updated`)
    console.log(`  - ${sequencedTasks.length} workflows will become tasks with steps`)
    console.log(`  - ${migratedSteps.length} steps will be migrated`)
    console.log(`  - ${unifiedWorkSessions.length} work sessions will be unified`)
    console.log('\n⚠️  Review the migration report before proceeding:')
    console.log(`  ${path.join(migrationPath, 'migration-report.json')}`)
    console.log('\nTo apply the migration, update your schema.prisma and run:')
    console.log('  npx prisma migrate dev --name unified_tasks')
    
  } catch (error) {
    console.error('❌ Migration preparation failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(console.error)