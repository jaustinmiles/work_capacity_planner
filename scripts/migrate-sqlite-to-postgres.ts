#!/usr/bin/env ts-node
/**
 * SQLite to PostgreSQL Data Migration Script
 *
 * Migrates all data from the local SQLite database (prisma/dev.db) to PostgreSQL.
 *
 * Prerequisites:
 * 1. PostgreSQL must be running with the 'taskplanner' database created
 * 2. Run 'npm run db:migrate:pg' first to create the schema
 * 3. Have your .env.server configured with correct DATABASE_URL
 *
 * Usage:
 *   npx ts-node scripts/migrate-sqlite-to-postgres.ts
 *
 * Or with dotenv:
 *   dotenv -e .env.server -- npx ts-node scripts/migrate-sqlite-to-postgres.ts
 */

import { PrismaClient as PgClient } from '@prisma/client'
import Database from 'better-sqlite3'
import * as path from 'path'

// SQLite database path
const SQLITE_PATH = path.join(__dirname, '../prisma/dev.db')

// Tables in dependency order (children after parents)
const TABLES_IN_ORDER = [
  'Session',
  'Project',
  'DailySchedule',
  'UserTaskType',
  'TimeSink',
  'TimeSinkSession',
  'WorkPattern',
  'WorkBlock',
  'WorkMeeting',
  'Task',
  'TaskStep',
  'ScheduledTask',
  'SequencedTask',
  'WorkSession',
  'TimeEstimateAccuracy',
  'ProductivityPattern',
  'SchedulingPreferences',
  'JobContext',
  'ContextEntry',
  'JargonEntry',
  'Conversation',
  'ChatMessage',
  'ScheduleSnapshot',
  'ErrorLog',
  'LogMetric',
  'AppLog',
  'Meeting',
]

/**
 * Convert SQLite date strings to JavaScript Date objects
 */
function parseDate(value: string | number | null): Date | null {
  if (!value) return null
  if (typeof value === 'number') {
    return new Date(value)
  }
  // SQLite stores dates as ISO strings
  return new Date(value)
}

/**
 * Convert SQLite boolean (0/1) to JavaScript boolean
 */
function parseBool(value: number | null): boolean {
  return value === 1
}

async function migrate() {
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║     SQLite to PostgreSQL Migration                         ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  console.log('')

  // Check if SQLite database exists
  const fs = await import('fs')
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`❌ SQLite database not found at: ${SQLITE_PATH}`)
    process.exit(1)
  }

  console.log(`📂 SQLite source: ${SQLITE_PATH}`)
  console.log(`🐘 PostgreSQL target: ${process.env.DATABASE_URL}`)
  console.log('')

  // Connect to both databases
  const sqlite = new Database(SQLITE_PATH, { readonly: true })
  const pg = new PgClient()

  try {
    await pg.$connect()
    console.log('✅ Connected to PostgreSQL')

    // Get table counts from SQLite
    console.log('')
    console.log('📊 Source data counts:')
    const counts: Record<string, number> = {}
    for (const table of TABLES_IN_ORDER) {
      try {
        const result = sqlite.prepare(`SELECT COUNT(*) as count FROM "${table}"`).get() as { count: number }
        counts[table] = result.count
        if (result.count > 0) {
          console.log(`   ${table}: ${result.count} records`)
        }
      } catch {
        // Table might not exist in SQLite
        counts[table] = 0
      }
    }

    console.log('')
    console.log('🚀 Starting migration...')
    console.log('')

    // Migrate each table
    let totalMigrated = 0
    for (const table of TABLES_IN_ORDER) {
      if (counts[table] === 0) continue

      try {
        const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[]

        if (rows.length === 0) continue

        console.log(`   Migrating ${table}...`)

        // Use raw SQL for bulk insert
        for (const row of rows) {
          // Convert dates and booleans for PostgreSQL
          const processedRow = processRow(table, row)

          // Use Prisma's create method
          await (pg as Record<string, { create: (data: { data: unknown }) => Promise<unknown> }>)[
            table.charAt(0).toLowerCase() + table.slice(1)
          ].create({
            data: processedRow,
          })
        }

        console.log(`   ✅ ${table}: ${rows.length} records migrated`)
        totalMigrated += rows.length
      } catch (error) {
        console.error(`   ❌ ${table}: Error - ${(error as Error).message}`)
      }
    }

    console.log('')
    console.log('════════════════════════════════════════════════════════════')
    console.log(`✅ Migration complete! Total records migrated: ${totalMigrated}`)
    console.log('════════════════════════════════════════════════════════════')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    sqlite.close()
    await pg.$disconnect()
  }
}

/**
 * Process a row for PostgreSQL compatibility
 */
function processRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const processed: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(row)) {
    // Handle dates - only fields that END with specific suffixes or are exact matches
    if (isDateField(table, key)) {
      processed[key] = parseDate(value as string | number | null)
    }
    // Handle booleans
    else if (typeof value === 'number' && (value === 0 || value === 1) && isBooleanField(table, key)) {
      processed[key] = parseBool(value)
    }
    // Pass through other values
    else {
      processed[key] = value
    }
  }

  // Apply defaults for non-nullable fields
  return applyDefaults(table, processed)
}

/**
 * Check if a field is a date field based on schema
 */
function isDateField(table: string, field: string): boolean {
  // These fields look like dates but are actually strings or integers
  const nonDateFields: Record<string, string[]> = {
    WorkBlock: ['startTime', 'endTime'],
    WorkMeeting: ['startTime', 'endTime'],
    WorkPattern: ['date'],
    Task: ['asyncWaitTime', 'expectedResponseTime'],
    TaskStep: ['asyncWaitTime', 'expectedResponseTime'],
  }
  if (nonDateFields[table]?.includes(field)) {
    return false
  }

  // Fields that END with these suffixes are DateTime
  const dateSuffixes = ['At', 'Time']
  for (const suffix of dateSuffixes) {
    if (field.endsWith(suffix)) return true
  }

  // Exact match date fields
  const exactDateFields = ['deadline']
  return exactDateFields.includes(field)
}

/**
 * Apply default values for non-nullable fields that might be null in SQLite
 */
function applyDefaults(table: string, row: Record<string, unknown>): Record<string, unknown> {
  // Fields that need default values when null
  const defaults: Record<string, Record<string, unknown>> = {
    Task: { asyncWaitTime: 0 },
    TaskStep: { asyncWaitTime: 0 },
  }

  const tableDefaults = defaults[table]
  if (tableDefaults) {
    for (const [field, defaultValue] of Object.entries(tableDefaults)) {
      if (row[field] === null || row[field] === undefined) {
        row[field] = defaultValue
      }
    }
  }

  return row
}

/**
 * Check if a field is a boolean field based on schema
 */
function isBooleanField(table: string, field: string): boolean {
  const booleanFields: Record<string, string[]> = {
    Session: ['isActive'],
    Task: ['completed', 'isLocked', 'hasSteps', 'archived'],
    TaskStep: ['isAsyncTrigger'],
    SequencedTask: ['completed'],
    WorkPattern: ['isTemplate'],
    Meeting: ['recurring'],
    JobContext: ['isActive'],
    Conversation: ['isArchived'],
    ScheduledTask: ['isPartial', 'isStart', 'isEnd'],
    SchedulingPreferences: ['allowWeekendWork'],
  }

  return booleanFields[table]?.includes(field) ?? false
}

// Run the migration
migrate().catch(console.error)
