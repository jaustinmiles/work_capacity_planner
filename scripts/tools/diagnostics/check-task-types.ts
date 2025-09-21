#!/usr/bin/env npx tsx
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=' .repeat(80))
  console.log('TASK TYPES INVESTIGATION')
  console.log('=' .repeat(80))

  // Get all unique task types in database
  const allTasks = await prisma.task.findMany({
    select: {
      type: true,
      name: true,
      sessionId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  // Group by type
  const typeGroups = new Map<string, number>()
  const examplesByType = new Map<string, any[]>()

  allTasks.forEach(task => {
    const count = typeGroups.get(task.type) || 0
    typeGroups.set(task.type, count + 1)

    if (!examplesByType.has(task.type)) {
      examplesByType.set(task.type, [])
    }
    const examples = examplesByType.get(task.type)!
    if (examples.length < 3) {
      examples.push(task)
    }
  })

  console.log('\n📊 TASK TYPES IN DATABASE:')
  console.log('-'.repeat(40))

  const validTypes = ['focused', 'admin', 'personal', 'mixed']

  typeGroups.forEach((count, type) => {
    const isValid = validTypes.includes(type)
    const marker = isValid ? '✅' : '❌'
    console.log(`${marker} "${type}": ${count} tasks`)

    const examples = examplesByType.get(type) || []
    examples.forEach(ex => {
      console.log(`     - ${ex.name} (${ex.sessionId})`)
      console.log(`       Created: ${ex.createdAt.toISOString()}`)
    })
  })

  // Check specific session if provided as argument
  const sessionNameFilter = process.argv[2]
  if (sessionNameFilter) {
    console.log(`\n📅 SESSION ANALYSIS: ${sessionNameFilter}`)
    console.log('-'.repeat(40))

    const sessions = await prisma.session.findMany({
      where: {
        name: { contains: sessionNameFilter },
      },
      include: {
        Task: {
          select: {
            name: true,
            type: true,
            createdAt: true,
          },
        },
      },
    })

    sessions.forEach(session => {
      console.log(`\nSession: ${session.name}`)
      console.log(`ID: ${session.id}`)
      console.log(`Created: ${session.createdAt.toISOString()}`)
      console.log(`Tasks: ${session.Task.length}`)

      session.Task.forEach(task => {
        const isValid = validTypes.includes(task.type)
        const marker = isValid ? '✅' : '❌'
        console.log(`  ${marker} ${task.name}: type="${task.type}"`)
      })
    })
  }

  // Check where these types might be coming from
  console.log('\n🔍 CHECKING FOR TYPE PATTERNS:')
  console.log('-'.repeat(40))

  // Tasks with invalid types
  const invalidTasks = allTasks.filter(t => !validTypes.includes(t.type))
  if (invalidTasks.length > 0) {
    console.log(`Found ${invalidTasks.length} tasks with invalid types`)

    // Group by session
    const sessionGroups = new Map<string, string[]>()
    invalidTasks.forEach(task => {
      if (!sessionGroups.has(task.sessionId)) {
        sessionGroups.set(task.sessionId, [])
      }
      sessionGroups.get(task.sessionId)!.push(task.type)
    })

    console.log('\nInvalid types by session:')
    sessionGroups.forEach((types, sessionId) => {
      const uniqueTypes = [...new Set(types)]
      console.log(`  ${sessionId}: ${uniqueTypes.join(', ')}`)
    })
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
