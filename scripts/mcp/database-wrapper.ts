#!/usr/bin/env npx tsx
/**
 * Database Safety MCP Wrapper
 *
 * Provides safe database operations with mandatory backups before destructive actions.
 * Prevents accidental data loss by wrapping Prisma migrations with safety guardrails.
 *
 * BLOCKED OPERATIONS (will always be rejected):
 * - prisma migrate reset
 * - prisma db push --force-reset
 * - prisma db push (causes migration drift!)
 * - Raw SQL DROP/DELETE statements
 *
 * Supports both SQLite and PostgreSQL databases.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

// Paths relative to project root
// When compiled, __dirname is scripts/mcp/dist, so we need ../../.. to reach project root
const PROJECT_ROOT = path.join(__dirname, '../../..')
const SCHEMA_PATH = path.join(PROJECT_ROOT, 'prisma', 'schema.prisma')
const DB_PATH = path.join(PROJECT_ROOT, 'prisma', 'dev.db') // SQLite only
const BACKUP_DIR = path.join(PROJECT_ROOT, 'backups')

/**
 * Detect database provider from schema.prisma
 */
function detectDatabaseProvider(): 'postgresql' | 'sqlite' {
  try {
    const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf-8')
    if (schemaContent.includes('provider = "postgresql"')) {
      return 'postgresql'
    }
  } catch {
    // Fall back to sqlite if we can't read the schema
  }
  return 'sqlite'
}

/**
 * Parse DATABASE_URL from .env file
 */
function getDatabaseUrl(): string | undefined {
  const envPath = path.join(PROJECT_ROOT, '.env')
  try {
    const envContent = fs.readFileSync(envPath, 'utf-8')
    const match = envContent.match(/DATABASE_URL="?([^"\n]+)"?/)
    return match?.[1]
  } catch {
    return process.env.DATABASE_URL
  }
}

class DatabaseWrapper {
  private server: Server
  private dbProvider: 'postgresql' | 'sqlite'

  constructor() {
    this.dbProvider = detectDatabaseProvider()
    this.server = new Server(
      {
        name: 'database-wrapper',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    )

    this.setupHandlers()
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getTools(),
      }
    })

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params
      return this.handleToolCall(name, args || {})
    })
  }

  private getTools(): Tool[] {
    return [
      {
        name: 'backup_database',
        description: 'Create a timestamped backup of the database. Always safe to run.',
        inputSchema: {
          type: 'object',
          properties: {
            reason: {
              type: 'string',
              description: 'Optional reason for the backup (included in output)',
            },
          },
        },
      },
      {
        name: 'list_backups',
        description: 'List all available database backups with sizes and dates.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of backups to show (default: 10)',
              default: 10,
            },
          },
        },
      },
      {
        name: 'restore_database',
        description: 'Restore database from a backup. REQUIRES confirm: true parameter.',
        inputSchema: {
          type: 'object',
          properties: {
            backupName: {
              type: 'string',
              description: 'Name of backup file to restore (e.g., backup_2024-12-04_123456.db)',
            },
            confirm: {
              type: 'boolean',
              description: 'Must be true to proceed. This is a destructive operation.',
            },
          },
          required: ['backupName', 'confirm'],
        },
      },
      {
        name: 'safe_migrate',
        description: 'Run Prisma migration with automatic backup first. Safe to use.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Migration name (e.g., add_user_column)',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'migration_status',
        description: 'Check migration status without making changes. Read-only operation.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'generate_client',
        description: 'Run prisma generate to update the client. No database changes.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ]
  }

  private async handleToolCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    try {
      let result: string

      switch (name) {
        case 'backup_database':
          result = await this.backupDatabase(args.reason as string | undefined)
          break
        case 'list_backups':
          result = await this.listBackups((args.limit as number) || 10)
          break
        case 'restore_database':
          result = await this.restoreDatabase(
            args.backupName as string,
            args.confirm as boolean,
          )
          break
        case 'safe_migrate':
          result = await this.safeMigrate(args.name as string)
          break
        case 'migration_status':
          result = await this.migrationStatus()
          break
        case 'generate_client':
          result = await this.generateClient()
          break
        default:
          result = `❌ Unknown tool: ${name}`
      }

      return {
        content: [{ type: 'text', text: result }],
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        content: [{ type: 'text', text: `❌ Error: ${errorMessage}` }],
      }
    }
  }

  // ============================================================================
  // Tool Implementations
  // ============================================================================

  private async backupDatabase(reason?: string): Promise<string> {
    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true })
    }

    // Create timestamp for backup name
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .split('T')
      .join('_')
      .slice(0, -5)

    if (this.dbProvider === 'postgresql') {
      return this.backupPostgres(timestamp, reason)
    } else {
      return this.backupSqlite(timestamp, reason)
    }
  }

  private async backupPostgres(timestamp: string, reason?: string): Promise<string> {
    const dbUrl = getDatabaseUrl()
    if (!dbUrl) {
      return '❌ DATABASE_URL not found in .env file or environment'
    }

    const backupName = `backup_${timestamp}.sql`
    const backupPath = path.join(BACKUP_DIR, backupName)

    try {
      // Use pg_dump to create a SQL dump
      await this.runCommand('pg_dump', [dbUrl, '-f', backupPath])

      const stats = fs.statSync(backupPath)
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2)

      let output = '✅ **PostgreSQL Backup Created**\n\n'
      output += `📁 **Location:** ${backupPath}\n`
      output += `📊 **Size:** ${sizeMB} MB\n`
      output += `🕐 **Timestamp:** ${timestamp}\n`
      output += '🐘 **Provider:** PostgreSQL (pg_dump)\n'
      if (reason) {
        output += `📝 **Reason:** ${reason}\n`
      }

      return output
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      return `❌ PostgreSQL backup failed:\n\`\`\`\n${errorMsg}\n\`\`\`\n\n💡 Make sure pg_dump is installed and DATABASE_URL is correct.`
    }
  }

  private async backupSqlite(timestamp: string, reason?: string): Promise<string> {
    // Check if database exists
    if (!fs.existsSync(DB_PATH)) {
      return `❌ SQLite database file not found at: ${DB_PATH}\n\n💡 If using PostgreSQL, the backup should use pg_dump instead.`
    }

    const backupName = `backup_${timestamp}.db`
    const backupPath = path.join(BACKUP_DIR, backupName)

    // Copy database file
    fs.copyFileSync(DB_PATH, backupPath)

    // Also backup WAL file if it exists
    const walPath = `${DB_PATH}-wal`
    if (fs.existsSync(walPath)) {
      fs.copyFileSync(walPath, `${backupPath}-wal`)
    }

    // Also backup SHM file if it exists
    const shmPath = `${DB_PATH}-shm`
    if (fs.existsSync(shmPath)) {
      fs.copyFileSync(shmPath, `${backupPath}-shm`)
    }

    const stats = fs.statSync(backupPath)
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2)

    let output = '✅ **SQLite Backup Created**\n\n'
    output += `📁 **Location:** ${backupPath}\n`
    output += `📊 **Size:** ${sizeMB} MB\n`
    output += `🕐 **Timestamp:** ${timestamp}\n`
    if (reason) {
      output += `📝 **Reason:** ${reason}\n`
    }

    return output
  }

  private async listBackups(limit: number): Promise<string> {
    if (!fs.existsSync(BACKUP_DIR)) {
      return '📁 No backups directory found. No backups have been created yet.'
    }

    // List both .db (SQLite) and .sql (PostgreSQL) backups
    const backups = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('backup_') && (f.endsWith('.db') || f.endsWith('.sql')))
      .sort()
      .reverse()
      .slice(0, limit)

    if (backups.length === 0) {
      return `📁 No backups found in ${BACKUP_DIR}`
    }

    let output = `📚 **Available Backups** (showing ${backups.length})\n\n`

    for (const backup of backups) {
      const backupPath = path.join(BACKUP_DIR, backup)
      const stats = fs.statSync(backupPath)
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
      const date = stats.mtime.toISOString().split('T')[0]
      const time = stats.mtime.toISOString().split('T')[1].slice(0, 8)
      const dbType = backup.endsWith('.sql') ? '🐘 PG' : '📦 SQLite'

      output += `- ${dbType} **${backup}** (${sizeMB} MB) - ${date} ${time}\n`
    }

    output += '\n💡 Use `restore_database` with backup name to restore.'

    return output
  }

  private async restoreDatabase(backupName: string, confirm: boolean): Promise<string> {
    // Safety check: require explicit confirmation
    if (!confirm) {
      return '⚠️ **Restore Blocked**\n\nYou must set `confirm: true` to restore a database.\nThis will overwrite the current database with the backup.'
    }

    const backupPath = path.join(BACKUP_DIR, backupName)

    if (!fs.existsSync(backupPath)) {
      return `❌ Backup not found: ${backupPath}\n\nUse \`list_backups\` to see available backups.`
    }

    // Create pre-restore backup first
    const preRestoreBackup = await this.backupDatabase('pre-restore safety backup')

    // Determine restore method based on file extension
    if (backupName.endsWith('.sql')) {
      return this.restorePostgres(backupName, backupPath, preRestoreBackup)
    } else {
      return this.restoreSqlite(backupName, backupPath, preRestoreBackup)
    }
  }

  private async restorePostgres(
    backupName: string,
    backupPath: string,
    preRestoreBackup: string,
  ): Promise<string> {
    const dbUrl = getDatabaseUrl()
    if (!dbUrl) {
      return '❌ DATABASE_URL not found in .env file or environment'
    }

    try {
      // Use psql to restore the SQL dump
      await this.runCommand('psql', [dbUrl, '-f', backupPath])

      let output = '✅ **PostgreSQL Database Restored Successfully**\n\n'
      output += `📦 **Restored from:** ${backupName}\n`
      output += '🐘 **Provider:** PostgreSQL (psql)\n'
      output += '🔒 **Pre-restore backup created** (in case you need to undo)\n\n'
      output += preRestoreBackup

      return output
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      return `❌ PostgreSQL restore failed:\n\`\`\`\n${errorMsg}\n\`\`\`\n\n💡 Pre-restore backup was created. Make sure psql is installed.`
    }
  }

  private async restoreSqlite(
    backupName: string,
    backupPath: string,
    preRestoreBackup: string,
  ): Promise<string> {
    // Restore the database
    fs.copyFileSync(backupPath, DB_PATH)

    // Restore WAL file if it exists in backup
    const walBackupPath = `${backupPath}-wal`
    const walPath = `${DB_PATH}-wal`
    if (fs.existsSync(walBackupPath)) {
      fs.copyFileSync(walBackupPath, walPath)
    } else if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath) // Remove stale WAL
    }

    // Restore SHM file if it exists in backup
    const shmBackupPath = `${backupPath}-shm`
    const shmPath = `${DB_PATH}-shm`
    if (fs.existsSync(shmBackupPath)) {
      fs.copyFileSync(shmBackupPath, shmPath)
    } else if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath) // Remove stale SHM
    }

    let output = '✅ **SQLite Database Restored Successfully**\n\n'
    output += `📦 **Restored from:** ${backupName}\n`
    output += '🔒 **Pre-restore backup created** (in case you need to undo)\n\n'
    output += preRestoreBackup

    return output
  }

  private async safeMigrate(migrationName: string): Promise<string> {
    // Step 1: Create backup FIRST
    const backupResult = await this.backupDatabase(`before migration: ${migrationName}`)

    let output = '🔄 **Safe Migration Started**\n\n'
    output += `## Step 1: Backup\n${backupResult}\n\n`

    // Step 2: Run migration
    output += '## Step 2: Running Migration\n'

    try {
      const migrateResult = await this.runCommand('npx', [
        'prisma',
        'migrate',
        'dev',
        '--name',
        migrationName,
      ])
      output += `\`\`\`\n${migrateResult}\n\`\`\`\n\n`
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      output += `\n❌ **Migration Failed**\n\`\`\`\n${errorMsg}\n\`\`\`\n\n`
      output += '💡 Your database backup was created before the migration attempt.\n'
      output += 'Use `restore_database` to roll back if needed.'
      return output
    }

    // Step 3: Generate client
    output += '## Step 3: Generating Prisma Client\n'
    try {
      const generateResult = await this.runCommand('npx', ['prisma', 'generate'])
      output += `\`\`\`\n${generateResult}\n\`\`\`\n\n`
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      output += `\n⚠️ **Generate Warning**\n\`\`\`\n${errorMsg}\n\`\`\`\n\n`
    }

    output += '✅ **Migration Complete!**'

    return output
  }

  private async migrationStatus(): Promise<string> {
    try {
      const result = await this.runCommand('npx', ['prisma', 'migrate', 'status'])
      return `📊 **Migration Status**\n\n\`\`\`\n${result}\n\`\`\``
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      return `❌ Failed to get migration status:\n\`\`\`\n${errorMsg}\n\`\`\``
    }
  }

  private async generateClient(): Promise<string> {
    try {
      const result = await this.runCommand('npx', ['prisma', 'generate'])
      return `✅ **Prisma Client Generated**\n\n\`\`\`\n${result}\n\`\`\``
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      return `❌ Failed to generate client:\n\`\`\`\n${errorMsg}\n\`\`\``
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private runCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd: PROJECT_ROOT,
        shell: true,
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout || stderr || 'Command completed successfully')
        } else {
          reject(new Error(stderr || stdout || `Command failed with code ${code}`))
        }
      })

      proc.on('error', (err) => {
        reject(err)
      })

      // Timeout after 2 minutes
      setTimeout(() => {
        proc.kill('SIGTERM')
        setTimeout(() => proc.kill('SIGKILL'), 5000)
        reject(new Error('Command timed out after 2 minutes'))
      }, 120000)
    })
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
  }
}

// Start the server
const wrapper = new DatabaseWrapper()
wrapper.run().catch((error) => {
  console.error('Failed to start database MCP server:', error)
  process.exit(1)
})
