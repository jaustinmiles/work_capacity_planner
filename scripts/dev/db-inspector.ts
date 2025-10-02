#!/usr/bin/env npx tsx
/**
 * Database Inspector
 * Clean, interactive database inspection tool
 */

import { Command } from 'commander'
import { PrismaClient } from '@prisma/client'
import { calculateBlockCapacity, getTotalCapacityForTaskType } from '../../src/shared/capacity-calculator'
import { TaskType } from '../../src/shared/enums'

const prisma = new PrismaClient()

const program = new Command()
  .name('db-inspector')
  .description('Professional database inspector for task-planner')

// Session inspection
program
  .command('session [id]')
  .description('Inspect sessions (active by default)')
  .option('-a, --all', 'Show all sessions')
  .action(async (id, options) => {
    if (id) {
      // Show specific session
      const session = await prisma.session.findUnique({
        where: { id },
        include: {
          Task: { where: { completed: false } },
          WorkPattern: {
            orderBy: { date: 'desc' },
            take: 1,
            include: {
              WorkBlock: true,
              WorkMeeting: true,
            },
          },
        },
      })

      if (!session) {
        console.log('❌ Session not found')
        process.exit(1)
      }

      console.log('\n📅 Session Details')
      console.log('==================')
      console.log(`Name: ${session.name}`)
      console.log(`ID: ${session.id}`)
      console.log(`Active: ${session.isActive ? '✓' : '✗'}`)
      console.log(`Tasks: ${session.Task.length} incomplete`)

      if (session.WorkPattern[0]) {
        const pattern = session.WorkPattern[0]
        console.log(`\nToday's Pattern: ${pattern.date}`)
        console.log(`  Blocks: ${pattern.WorkBlock.length}`)
        console.log(`  Meetings: ${pattern.WorkMeeting.length}`)
      }
    } else if (options.all) {
      // Show all sessions
      const sessions = await prisma.session.findMany({
        include: { _count: { select: { Task: true } } },
      })

      console.log('\n📅 All Sessions')
      console.log('Name                  | ID       | Active | Tasks')
      console.log('---------------------|----------|--------|------')
      sessions.forEach(s => {
        console.log(
          `${s.name.padEnd(20)} | ${s.id.substring(0, 8)} | ${s.isActive ? '  ✓    ' : '  -    '} | ${s._count.Task.toString().padStart(5)}`,
        )
      })
    } else {
      // Show active session
      const session = await prisma.session.findFirst({
        where: { isActive: true },
      })

      if (!session) {
        console.log('❌ No active session')
        process.exit(1)
      }

      console.log('\n📅 Active Session')
      console.log('=================')
      console.log(`Name: ${session.name}`)
      console.log(`ID: ${session.id}`)
      console.log('\nRun with session ID for more details')
    }

    await prisma.$disconnect()
  })

// Task inspection
program
  .command('tasks')
  .description('Inspect tasks')
  .option('-s, --session <id>', 'Filter by session ID')
  .option('-c, --completed', 'Show completed tasks')
  .option('-l, --limit <n>', 'Limit results', '10')
  .action(async (options) => {
    const where: any = {}

    if (options.session) {
      where.sessionId = options.session
    } else {
      // Default to active session
      const activeSession = await prisma.session.findFirst({
        where: { isActive: true },
      })
      if (activeSession) {
        where.sessionId = activeSession.id
      }
    }

    if (!options.completed) {
      where.completed = false
    }

    const tasks = await prisma.task.findMany({
      where,
      take: parseInt(options.limit),
      orderBy: { createdAt: 'desc' },
    })

    if (tasks.length === 0) {
      console.log('No tasks found')
      await prisma.$disconnect()
      return
    }

    console.log('\n📋 Tasks')
    console.log('Name                                    | Duration | Type     | Priority | Status')
    console.log('----------------------------------------|----------|----------|----------|---------')
    tasks.forEach(task => {
      const priority = task.importance * task.urgency
      console.log(
        `${task.name.substring(0, 38).padEnd(39)} | ${task.duration.toString().padStart(7)}m | ${task.type.padEnd(8)} | ${priority.toFixed(1).padStart(8)} | ${task.completed ? '   ✓    ' : '   ○    '}`,
      )
    })
    console.log(`\nShowing ${tasks.length} tasks`)

    await prisma.$disconnect()
  })

// Work pattern inspection
program
  .command('pattern [date]')
  .description('Inspect work patterns (today by default)')
  .option('-s, --session <id>', 'Specify session ID')
  .action(async (date, options) => {
    const targetDate = date || new Date().toISOString().split('T')[0]

    let sessionId = options.session
    if (!sessionId) {
      const activeSession = await prisma.session.findFirst({
        where: { isActive: true },
      })
      sessionId = activeSession?.id
    }

    if (!sessionId) {
      console.log('❌ No session specified and no active session found')
      process.exit(1)
    }

    const pattern = await prisma.workPattern.findFirst({
      where: {
        sessionId,
        date: targetDate,
      },
      include: {
        WorkBlock: { orderBy: { startTime: 'asc' } },
        WorkMeeting: { orderBy: { startTime: 'asc' } },
      },
    })

    if (!pattern) {
      console.log(`No work pattern found for ${targetDate}`)
      await prisma.$disconnect()
      return
    }

    console.log('\n📆 Work Pattern')
    console.log('===============')
    console.log(`Date: ${pattern.date}`)
    console.log(`Session: ${sessionId}`)

    if (pattern.WorkBlock.length > 0) {
      console.log('\n⏰ Work Blocks')
      console.log('Time          | Type      | Capacity | Split')
      console.log('--------------|-----------|----------|------')
      pattern.WorkBlock.forEach(block => {
        console.log(
          `${block.startTime} - ${block.endTime} | ${block.type.padEnd(9)} | ${block.totalCapacity.toString().padStart(7)}m | ${block.splitRatio || '-'}`,
        )
      })
    }

    if (pattern.WorkMeeting.length > 0) {
      console.log('\n🤝 Meetings')
      console.log('Time          | Title                | Duration')
      console.log('--------------|----------------------|----------')
      pattern.WorkMeeting.forEach(meeting => {
        const [sh, sm] = meeting.startTime.split(':').map(Number)
        const [eh, em] = meeting.endTime.split(':').map(Number)
        const duration = (eh * 60 + em) - (sh * 60 + sm)

        console.log(
          `${meeting.startTime} - ${meeting.endTime} | ${(meeting.title || 'Untitled').substring(0, 20).padEnd(20)} | ${duration.toString().padStart(7)}m`,
        )
      })
    }

    await prisma.$disconnect()
  })

// Capacity summary
program
  .command('capacity [date]')
  .description('Show capacity summary for a date')
  .action(async (date) => {
    const targetDate = date || new Date().toISOString().split('T')[0]

    const activeSession = await prisma.session.findFirst({
      where: { isActive: true },
    })

    if (!activeSession) {
      console.log('❌ No active session')
      process.exit(1)
    }

    const pattern = await prisma.workPattern.findFirst({
      where: {
        sessionId: activeSession.id,
        date: targetDate,
      },
      include: { WorkBlock: true },
    })

    if (!pattern) {
      console.log(`No work pattern found for ${targetDate}`)
      await prisma.$disconnect()
      return
    }

    // Calculate capacity using the actual capacity calculator
    let totalFocus = 0
    let totalAdmin = 0
    let totalPersonal = 0
    let totalFlexible = 0

    pattern.WorkBlock.forEach(block => {
      const capacity = calculateBlockCapacity(
        block.type,
        block.startTime,
        block.endTime,
        block.splitRatio,
      )

      // Extract type-specific capacities using the helper function
      totalFocus += getTotalCapacityForTaskType(capacity, TaskType.Focused)
      totalAdmin += getTotalCapacityForTaskType(capacity, TaskType.Admin)
      totalPersonal += getTotalCapacityForTaskType(capacity, TaskType.Personal)
      totalFlexible += getTotalCapacityForTaskType(capacity, TaskType.Flexible)
    })

    console.log('\n💪 Capacity Summary')
    console.log('===================')
    console.log(`Date: ${targetDate}`)
    console.log(`Session: ${activeSession.name}`)
    console.log('')
    console.log(`Focus: ${totalFocus} minutes`)
    console.log(`Admin: ${totalAdmin} minutes`)
    console.log(`Personal: ${totalPersonal} minutes`)
    if (totalFlexible > 0) {
      console.log(`Flexible: ${totalFlexible} minutes`)
    }
    console.log('')
    console.log(`Total: ${totalFocus + totalAdmin + totalPersonal + totalFlexible} minutes`)

    // Compare with task demand
    const tasks = await prisma.task.findMany({
      where: {
        sessionId: activeSession.id,
        completed: false,
      },
    })

    const tasksByType = {
      focused: 0,
      admin: 0,
      personal: 0,
    }

    tasks.forEach(task => {
      const type = task.type as keyof typeof tasksByType
      if (type in tasksByType) {
        tasksByType[type] += task.duration
      }
    })

    console.log('📋 Task Demand')
    console.log(`Focus: ${tasksByType.focused} minutes`)
    console.log(`Admin: ${tasksByType.admin} minutes`)
    console.log(`Personal: ${tasksByType.personal} minutes`)
    console.log('')

    const focusBalance = totalFocus + totalFlexible - tasksByType.focused
    const adminBalance = totalAdmin - tasksByType.admin
    const personalBalance = totalPersonal - tasksByType.personal

    console.log('⚖️ Balance')
    console.log(`Focus: ${focusBalance >= 0 ? `+${focusBalance}` : focusBalance} minutes`)
    console.log(`Admin: ${adminBalance >= 0 ? `+${adminBalance}` : adminBalance} minutes`)
    console.log(`Personal: ${personalBalance >= 0 ? `+${personalBalance}` : personalBalance} minutes`)

    await prisma.$disconnect()
  })

// Work session inspection
program
  .command('work-sessions')
  .description('Inspect work sessions')
  .option('-t, --task <id>', 'Filter by task ID')
  .option('-s, --step <id>', 'Filter by step ID')
  .option('-l, --limit <n>', 'Limit results', '10')
  .action(async (options) => {
    const limit = parseInt(options.limit)

    const where: any = {}
    if (options.task) {
      where.taskId = options.task
    }
    if (options.step) {
      where.stepId = options.step
    }

    const workSessions = await prisma.workSession.findMany({
      where,
      orderBy: { startTime: 'desc' },
      take: limit,
      include: {
        Task: { select: { name: true } },
      },
    })

    console.log('\n⏱️  Work Sessions')
    console.log('================')

    if (workSessions.length === 0) {
      console.log('No work sessions found')
    } else {
      console.log(`Found ${workSessions.length} work session(s)\n`)
      for (const ws of workSessions) {
        console.log(`ID: ${ws.id}`)
        if (ws.Task) {
          console.log(`Task: ${ws.Task.name} (${ws.taskId})`)
        }
        if (ws.stepId) {
          // Fetch step name separately since there's no direct relation
          const step = await prisma.taskStep.findUnique({
            where: { id: ws.stepId },
            select: { name: true },
          })
          if (step) {
            console.log(`Step: ${step.name} (${ws.stepId})`)
          }
        }
        console.log(`Type: ${ws.type}`)
        console.log(`Start Time: ${ws.startTime.toISOString()}`)
        if (ws.endTime) {
          console.log(`End Time: ${ws.endTime.toISOString()}`)
        }
        console.log(`Planned: ${ws.plannedMinutes} minutes`)
        if (ws.actualMinutes) {
          console.log(`Actual: ${ws.actualMinutes} minutes`)
        }
        if (ws.notes) {
          console.log(`Notes: ${ws.notes}`)
        }
        console.log('---')
      }
    }

    await prisma.$disconnect()
  })

// Stats command
program
  .command('stats')
  .description('Show database statistics')
  .action(async () => {
    const [sessions, tasks, patterns, blocks, meetings] = await Promise.all([
      prisma.session.count(),
      prisma.task.count(),
      prisma.workPattern.count(),
      prisma.workBlock.count(),
      prisma.workMeeting.count(),
    ])

    const activeTasks = await prisma.task.count({ where: { completed: false } })
    const completedTasks = await prisma.task.count({ where: { completed: true } })

    console.log('\n📊 Database Statistics')
    console.log('=====================')
    console.log(`Sessions: ${sessions}`)
    console.log(`Tasks: ${tasks} (${activeTasks} active, ${completedTasks} completed)`)
    console.log(`Work Patterns: ${patterns}`)
    console.log(`Work Blocks: ${blocks}`)
    console.log(`Meetings: ${meetings}`)

    await prisma.$disconnect()
  })

program.parse()
