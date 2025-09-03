#!/usr/bin/env npx tsx
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Script to check for schema divergence between Prisma schemas and actual database
 * Usage: npx tsx scripts/check-schema-divergence.ts
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

async function main() {
  console.log('='.repeat(80))
  console.log('SCHEMA DIVERGENCE CHECK')
  console.log('='.repeat(80))

  try {
    // Check what tables actually have data
    console.log('\n📊 DATABASE TABLE RECORD COUNTS:')
    console.log('-'.repeat(80))

    const tables = [
      'session',
      'task',
      'taskStep',
      'scheduledTask',
      'sequencedTask',
      'workPattern',
      'meeting',
      'workBlock',
      'amendment',
    ]

    const tableCounts: Record<string, number> = {}

    for (const table of tables) {
      try {
        const count = await (prisma as any)[table].count()
        tableCounts[table] = count
        console.log(`  ${table}: ${count} records`)
      } catch (_error: any) {
        console.log(`  ${table}: ❌ Table doesn't exist or error accessing`)
      }
    }

    // Check for orphaned schemas
    console.log('\n📁 PRISMA SCHEMA FILES:')
    console.log('-'.repeat(80))

    const schemaDir = path.join(process.cwd(), 'prisma')
    const schemaFiles = fs.readdirSync(schemaDir).filter(f => f.endsWith('.prisma'))

    for (const file of schemaFiles) {
      const fullPath = path.join(schemaDir, file)
      const content = fs.readFileSync(fullPath, 'utf8')
      const models = content.match(/model\s+(\w+)\s*{/g) || []
      const modelNames = models.map(m => m.match(/model\s+(\w+)/)![1])

      console.log(`\n  ${file}:`)
      console.log(`    Models defined: ${modelNames.join(', ')}`)

      if (file === 'schema.prisma') {
        console.log('    Status: ✅ ACTIVE (this is the main schema)')
      } else {
        console.log('    Status: ⚠️  BACKUP/ALTERNATE schema')
      }
    }

    // Check for fields that might store schedule data
    console.log('\n🔍 CHECKING FOR SCHEDULE DATA STORAGE:')
    console.log('-'.repeat(80))

    // Check if any tasks have schedule-related fields populated
    const tasksWithScheduleData = await prisma.task.findFirst({
      where: {
        OR: [
          { scheduledDate: { not: null } },
          { scheduledStartTime: { not: null } },
          { scheduledEndTime: { not: null } },
        ],
      },
    }).catch(() => null)

    if (tasksWithScheduleData) {
      console.log('  Tasks table has schedule fields populated')
    } else {
      console.log('  Tasks table does NOT have schedule data (or fields don\'t exist)')
    }

    // Check ScheduledTask structure
    if (tableCounts['scheduledTask'] > 0) {
      const sample = await prisma.scheduledTask.findFirst()
      console.log('\n  Sample ScheduledTask record:')
      console.log('    Fields:', Object.keys(sample || {}))
    }

    // Check for JSON fields that might contain schedule data
    const taskWithSteps = await prisma.task.findFirst({
      where: { hasSteps: true },
    })

    if (taskWithSteps) {
      console.log('\n  Task with steps found:')
      console.log('    Has schedule data in JSON?', !!(taskWithSteps as any).schedule)
    }

    // Check WorkPattern for schedule data
    if (tableCounts['workPattern'] > 0) {
      const pattern = await prisma.workPattern.findFirst()
      console.log('\n  Sample WorkPattern:')
      if (pattern) {
        console.log('    Pattern field type:', typeof (pattern as any).pattern)
        if ((pattern as any).pattern) {
          console.log('    Pattern structure:', JSON.stringify((pattern as any).pattern, null, 2).substring(0, 200) + '...')
        }
      }
    }

    // Identify potential issues
    console.log('\n⚠️  POTENTIAL ISSUES:')
    console.log('='.repeat(80))

    const issues = []

    // Check for multiple schema files
    if (schemaFiles.length > 1) {
      issues.push(`Multiple schema files found (${schemaFiles.length}). This could cause confusion.`)
    }

    // Check for empty critical tables
    if (tableCounts['scheduledTask'] === 0 && tableCounts['workPattern'] > 0) {
      issues.push('ScheduledTask table is empty but WorkPattern has data - scheduling might be stored differently')
    }

    // Check for deprecated tables with data
    if (tableCounts['sequencedTask'] > 0) {
      issues.push('SequencedTask table has data - might be deprecated in favor of Task with hasSteps=true')
    }

    if (issues.length > 0) {
      issues.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue}`)
      })
    } else {
      console.log('No obvious schema divergence issues found')
    }

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:')
    console.log('='.repeat(80))
    console.log('1. The main schema file is prisma/schema.prisma')
    console.log('2. Other .prisma files appear to be backups or alternates')
    console.log('3. Schedule data might be stored in:')
    console.log('   - WorkPattern.pattern (JSON field)')
    console.log('   - Task fields (if they exist)')
    console.log('   - Or generated dynamically without persistence')

  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
