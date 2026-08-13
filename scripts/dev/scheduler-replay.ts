#!/usr/bin/env npx tsx
/**
 * Scheduler Replay Harness
 *
 * Runs the UnifiedScheduler against REAL session data from the database,
 * using exactly the same context/config as the desktop renderer
 * (useSchedulerStore.computeSchedule) and the server (task.getFullSchedule).
 *
 * This lets us reproduce scheduling bugs with production data instead of
 * synthetic unit-test fixtures.
 *
 * Usage:
 *   npx tsx scripts/dev/scheduler-replay.ts                      # active session, now
 *   npx tsx scripts/dev/scheduler-replay.ts --session <id|name>  # specific session
 *   npx tsx scripts/dev/scheduler-replay.ts --at "2026-07-31T16:53:35"  # frozen clock
 *
 * Output: the scheduled timeline, block-boundary violations, and unscheduled
 * items with reasons. Exit code 1 if any item is scheduled outside its block.
 */

import { Command } from 'commander'
import { PrismaClient } from '@prisma/client'
import { UnifiedScheduler, OptimizationMode } from '../../src/shared/unified-scheduler'
import { DailyWorkPattern } from '../../src/shared/work-blocks-types'
import { DEFAULT_WORK_SETTINGS } from '../../src/shared/work-settings-types'
import { MeetingType } from '../../src/shared/enums'
import { Task, SequencedTask } from '../../src/shared/types'
import {
  filterSchedulableItems,
  filterSchedulableWorkflows,
} from '../../src/shared/utils/store-comparison'
import {
  getCurrentTime,
  getLocalDateString,
  setTimeOverride,
} from '../../src/shared/time-provider'
import { parseTimeString } from '../../src/shared/time-utils'
import { generateUniqueId } from '../../src/shared/step-id-utils'

const prisma = new PrismaClient()

const LAB_SESSION_NAME = 'Claude Scheduler Lab'

/**
 * Create (or reset) a dedicated lab session with a minimal reproduction of the
 * block-boundary overflow: one small block today, one block tomorrow, and more
 * task minutes than today's block can hold. Never touches any other session.
 */
async function seedDemoSession(now: Date): Promise<string> {
  let session = await prisma.session.findFirst({ where: { name: LAB_SESSION_NAME } })
  if (session) {
    // Reset ONLY the lab session's own children so reseeding is idempotent
    const patterns = await prisma.workPattern.findMany({ where: { sessionId: session.id } })
    for (const p of patterns) {
      await prisma.workBlock.deleteMany({ where: { patternId: p.id } })
      await prisma.workMeeting.deleteMany({ where: { patternId: p.id } })
    }
    await prisma.workPattern.deleteMany({ where: { sessionId: session.id } })
    await prisma.task.deleteMany({ where: { sessionId: session.id } })
    await prisma.userTaskType.deleteMany({ where: { sessionId: session.id } })
  } else {
    session = await prisma.session.create({
      data: {
        id: generateUniqueId('session'),
        name: LAB_SESSION_NAME,
        description: 'Sandbox session for scheduler debugging (created by scheduler-replay --seed-demo)',
        isActive: false,
        updatedAt: now,
      },
    })
  }

  const typeId = generateUniqueId('type')
  await prisma.userTaskType.create({
    data: {
      id: typeId,
      sessionId: session.id,
      name: 'Lab Work',
      emoji: '🧪',
      color: '#4A90D9',
      updatedAt: now,
    },
  })

  const today = getLocalDateString(now)
  const tomorrow = getLocalDateString(new Date(now.getTime() + 24 * 60 * 60 * 1000))

  // Block today: 60 minutes starting on the current hour; block tomorrow: 60 minutes
  const pad = (n: number): string => n.toString().padStart(2, '0')
  const todayStart = `${pad(now.getHours())}:00`
  const todayEnd = `${pad(now.getHours() + 1)}:00`

  for (const [date, startTime, endTime] of [
    [today, todayStart, todayEnd],
    [tomorrow, '09:00', '10:00'],
  ] as const) {
    await prisma.workPattern.create({
      data: {
        id: generateUniqueId('pattern'),
        date,
        sessionId: session.id,
        updatedAt: now,
        WorkBlock: {
          create: {
            id: generateUniqueId('block'),
            startTime,
            endTime,
            typeConfig: JSON.stringify({ kind: 'any' }),
          },
        },
      },
    })
  }

  const tasks: Array<[string, number, number, number]> = [
    ['Lab task A (fits today)', 30, 8, 8],
    ['Lab task B (should go tomorrow)', 30, 6, 6],
    ['Lab task C (should go tomorrow after B)', 60, 4, 4],
  ]
  for (const [name, duration, importance, urgency] of tasks) {
    await prisma.task.create({
      data: {
        id: generateUniqueId('task'),
        name,
        duration,
        importance,
        urgency,
        type: typeId,
        category: 'work',
        sessionId: session.id,
        updatedAt: now,
      },
    })
  }

  console.log(`🧪 Seeded lab session "${LAB_SESSION_NAME}" (${session.id})`)
  console.log(`   Blocks: ${today} ${todayStart}-${todayEnd}, ${tomorrow} 09:00-10:00; tasks: 30+30+60min`)
  return session.id
}

interface BlockWindow {
  blockId: string
  date: string
  start: Date
  end: Date
  typeConfig: string
}

function parseTimeOnDate(dateStr: string, timeStr: string): Date {
  const [hour, minute] = parseTimeString(timeStr)
  const result = new Date(dateStr + 'T00:00:00')
  result.setHours(hour, minute, 0, 0)
  return result
}

function fmt(d: Date | undefined): string {
  if (!d) return '-'
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function resolveSessionId(sessionArg: string | undefined): Promise<{ id: string; name: string }> {
  if (sessionArg) {
    const byId = await prisma.session.findUnique({ where: { id: sessionArg } })
    if (byId) return { id: byId.id, name: byId.name }
    const byName = await prisma.session.findFirst({ where: { name: sessionArg } })
    if (byName) return { id: byName.id, name: byName.name }
    throw new Error(`No session found matching "${sessionArg}"`)
  }
  const active = await prisma.session.findFirst({ where: { isActive: true } })
  if (!active) throw new Error('No active session found')
  return { id: active.id, name: active.name }
}

const program = new Command()
  .name('scheduler-replay')
  .description('Replay the unified scheduler against real session data')
  .option('-s, --session <idOrName>', 'Session id or exact name (default: active session)')
  .option('--at <datetime>', 'Freeze the clock at this local datetime (e.g. 2026-07-31T16:53:35)')
  .option('--json', 'Emit raw JSON instead of tables')
  .option('--seed-demo', 'Create/reset the lab session with a minimal boundary-bug repro, then replay it')
  .action(async (options) => {
    if (options.at) {
      setTimeOverride(new Date(options.at))
    }

    if (options.seedDemo) {
      const labId = await seedDemoSession(getCurrentTime())
      options.session = labId
    }

    const session = await resolveSessionId(options.session)
    const currentTime = getCurrentTime()
    const startDateString = getLocalDateString(currentTime)

    console.log('🔁 Scheduler Replay')
    console.log('===================')
    console.log(`Session: ${session.name} (${session.id})`)
    console.log(`Now:     ${fmt(currentTime)} (local)  startDate=${startDateString}`)

    // --- Load tasks exactly like task.getAll (server) / useTaskStore (desktop) ---
    const rawTasks = await prisma.task.findMany({
      where: { sessionId: session.id, archived: false },
      include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
    })

    const allTasks = rawTasks.map((task) => ({
      ...task,
      dependencies: JSON.parse(task.dependencies || '[]') as string[],
      steps: task.TaskStep.map((step) => ({
        ...step,
        dependsOn: JSON.parse(step.dependsOn || '[]') as string[],
      })),
    }))

    const simpleTasks = filterSchedulableItems(
      allTasks.filter((t) => !t.hasSteps) as unknown as Task[],
    )
    const workflows = filterSchedulableWorkflows(
      allTasks.filter((t) => t.hasSteps) as unknown as SequencedTask[],
    )

    // --- Load ALL work patterns for the session (like workPattern.getAll) ---
    const rawPatterns = await prisma.workPattern.findMany({
      where: { sessionId: session.id, isTemplate: false },
      include: {
        WorkBlock: { orderBy: { startTime: 'asc' } },
        WorkMeeting: { orderBy: { startTime: 'asc' } },
      },
      orderBy: { date: 'asc' },
    })

    const workPatterns: DailyWorkPattern[] = rawPatterns.map((pattern) => ({
      id: pattern.id,
      date: pattern.date,
      blocks: pattern.WorkBlock.map((block) => ({
        id: block.id,
        startTime: block.startTime,
        endTime: block.endTime,
        typeConfig: JSON.parse(block.typeConfig),
        capacity: block.totalCapacity ? { totalMinutes: block.totalCapacity } : undefined,
      })),
      accumulated: {},
      meetings: pattern.WorkMeeting.map((meeting) => ({
        id: meeting.id,
        name: meeting.name,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        type: meeting.type as MeetingType,
        recurring: (meeting.recurring || 'none') as 'daily' | 'weekly' | 'none',
        daysOfWeek: meeting.daysOfWeek ? JSON.parse(meeting.daysOfWeek) : undefined,
      })),
    }))

    // Block windows for violation detection
    const blockWindows = new Map<string, BlockWindow>()
    for (const pattern of rawPatterns) {
      for (const block of pattern.WorkBlock) {
        blockWindows.set(block.id, {
          blockId: block.id,
          date: pattern.date,
          start: parseTimeOnDate(pattern.date, block.startTime),
          end: parseTimeOnDate(pattern.date, block.endTime),
          typeConfig: block.typeConfig,
        })
      }
    }

    console.log(`Tasks:   ${simpleTasks.length} schedulable standalone, ${workflows.length} workflows`)
    console.log(`Patterns: ${workPatterns.map((p) => `${p.date}[${p.blocks.map((b) => `${b.startTime}-${b.endTime}`).join(',')}]`).join('  ')}`)

    // --- Run the scheduler EXACTLY like useSchedulerStore.computeSchedule ---
    const scheduler = new UnifiedScheduler()
    const context = {
      startDate: startDateString,
      tasks: simpleTasks,
      workflows,
      workPatterns,
      workSettings: DEFAULT_WORK_SETTINGS,
      currentTime,
    }
    const config = {
      startDate: currentTime,
      allowTaskSplitting: true,
      minimumSplitMinutes: 30,
      respectMeetings: true,
      optimizationMode: OptimizationMode.Realistic,
      debugMode: false,
    }

    const result = scheduler.scheduleForDisplay([...simpleTasks, ...workflows], context, config)

    if (options.json) {
      console.log(JSON.stringify(result, null, 2))
      await prisma.$disconnect()
      return
    }

    // --- Report ---
    console.log(`\n📋 Scheduled (${result.scheduled.length} items incl. waits/meetings)`)
    console.log('Start                | End                  | Block window                              | Item')
    console.log('---------------------|----------------------|-------------------------------------------|-----')

    const violations: string[] = []
    const sorted = [...result.scheduled].sort(
      (a, b) => (a.startTime?.getTime() || 0) - (b.startTime?.getTime() || 0),
    )

    for (const item of sorted) {
      const window = item.blockId ? blockWindows.get(item.blockId) : undefined
      let windowStr = item.blockId ? `${item.blockId.slice(0, 12)}… (unknown)` : '(no block)'
      let flag = ''

      if (window) {
        windowStr = `${window.date} ${fmt(window.start).slice(11, 16)}-${fmt(window.end).slice(11, 16)}`
        if (item.startTime && item.endTime && !item.isWaitTime) {
          const startsEarly = item.startTime.getTime() < window.start.getTime()
          const endsLate = item.endTime.getTime() > window.end.getTime()
          if (startsEarly || endsLate) {
            flag = ' ⚠️ OUTSIDE BLOCK'
            violations.push(
              `${item.name}: ${fmt(item.startTime)} → ${fmt(item.endTime)} vs block ${windowStr}` +
                `${startsEarly ? ' [starts before block]' : ''}${endsLate ? ' [ends after block]' : ''}`,
            )
          }
        }
      }

      console.log(
        `${fmt(item.startTime)}  | ${fmt(item.endTime)}  | ${windowStr.padEnd(41)} | ${item.isWaitTime ? '⏳ ' : ''}${item.name}${flag}`,
      )
    }

    console.log(`\n🚫 Unscheduled (${result.unscheduled.length})`)
    for (const item of result.unscheduled) {
      const reason =
        result.debugInfo?.unscheduledItems?.find((u) => u.id === item.id)?.reason ||
        'unknown'
      console.log(`  - ${item.name} (${item.duration}min): ${reason}`)
    }

    if (result.conflicts?.length) {
      console.log(`\n⚠️ Conflicts: ${result.conflicts.map((c) => c.description).join('; ')}`)
    }
    if (result.warnings?.length) {
      console.log(`⚠️ Warnings: ${result.warnings.join('; ')}`)
    }

    console.log(`\n${violations.length === 0 ? '✅ All items respect their block windows' : `❌ ${violations.length} BLOCK-BOUNDARY VIOLATIONS:`}`)
    for (const v of violations) {
      console.log(`  - ${v}`)
    }

    await prisma.$disconnect()
    process.exit(violations.length === 0 ? 0 : 1)
  })

program.parse()
