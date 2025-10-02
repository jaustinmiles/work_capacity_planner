#!/usr/bin/env npx tsx
/**
 * Diagnostic MCP Wrapper
 *
 * Lightweight MCP server that wraps existing diagnostic scripts
 * instead of reimplementing functionality.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { spawn } from 'child_process'
import * as path from 'path'

class DiagnosticWrapper {
  private server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'diagnostic-wrapper',
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

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_next_feedback',
            description: 'Get next highest priority feedback item using existing feedback-utils.js',
            inputSchema: {
              type: 'object',
              properties: {
                filter: {
                  type: 'string',
                  enum: ['high', 'unresolved', 'summary'],
                  description: 'Type of feedback query',
                },
                type: {
                  type: 'string',
                  enum: ['bug', 'feature', 'improvement'],
                  description: 'Filter by feedback type',
                },
              },
            },
          },
          {
            name: 'inspect_database',
            description: 'Query database using existing db-inspector.ts script',
            inputSchema: {
              type: 'object',
              properties: {
                operation: {
                  type: 'string',
                  enum: ['tasks', 'session', 'capacity', 'stats', 'pattern', 'work-sessions'],
                  description: 'Database inspection operation',
                },
                params: {
                  type: 'string',
                  description: 'Additional parameters (e.g., session ID for session, date for pattern, --task <id> for work sessions, --all for all sessions)',
                },
              },
              required: ['operation'],
            },
          },
          {
            name: 'view_logs',
            description: 'View logs using existing log-viewer.ts script',
            inputSchema: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  enum: ['recent', 'tail', 'search'],
                  description: 'Log viewing action',
                },
                filter: {
                  type: 'string',
                  description: 'Filter pattern for logs',
                },
                level: {
                  type: 'string',
                  enum: ['error', 'warn', 'info', 'debug'],
                  description: 'Log level filter',
                },
                since: {
                  type: 'string',
                  description: 'Time filter (e.g., "1h", "30m")',
                },
                limit: {
                  type: 'number',
                  description: 'Number of log entries to show',
                },
              },
              required: ['action'],
            },
          },
          {
            name: 'run_lint',
            description: 'Run ESLint to check code quality',
            inputSchema: {
              type: 'object',
              properties: {
                quiet: {
                  type: 'boolean',
                  description: 'Only show errors, no warnings (default: true)',
                  default: true,
                },
                fix: {
                  type: 'boolean',
                  description: 'Automatically fix problems (default: false)',
                  default: false,
                },
              },
            },
          },
          // TODO(human): Add more MCP tools that wrap your existing scripts
          // Consider which diagnostic scripts from scripts/tools/diagnostics/
          // would be most useful as MCP tools
        ] satisfies Tool[],
      }
    })

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
          case 'get_next_feedback':
            return await this.callFeedbackUtils(args)

          case 'inspect_database':
            return await this.callDbInspector(args)

          case 'view_logs':
            return await this.callLogViewer(args)

          case 'run_lint':
            return await this.runLint(args)

          // TODO(human): Add cases for additional diagnostic tools

          default:
            throw new Error(`Unknown tool: ${name}`)
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    })
  }

  private async callFeedbackUtils(args: any) {
    const { filter = 'unresolved', type } = args
    const scriptPath = path.join(process.cwd(), 'scripts/analysis/feedback-utils.js')

    let command = [scriptPath, filter]
    if (type && filter === 'by-type') {
      command = [scriptPath, 'by-type', type]
    }

    const output = await this.runScript('node', command)

    return {
      content: [
        {
          type: 'text',
          text: `**Feedback Query Results**\n\n\`\`\`\n${output}\n\`\`\``,
        },
      ],
    }
  }

  private async callDbInspector(args: any) {
    const { operation, params } = args
    const scriptPath = path.join(process.cwd(), 'scripts/dev/db-inspector.ts')

    const command = ['tsx', scriptPath, operation]
    if (params) {
      // Split params by whitespace to handle multiple arguments
      command.push(...params.split(/\s+/))
    }

    const output = await this.runScript('npx', command)

    return {
      content: [
        {
          type: 'text',
          text: `**Database Inspection: ${operation}**\n\n\`\`\`\n${output}\n\`\`\``,
        },
      ],
    }
  }

  private async callLogViewer(args: any) {
    const { action, filter, level, since, limit } = args

    let scriptPath: string
    let command: string[]

    if (action === 'tail') {
      // Use tail-logs.ts for real-time monitoring
      scriptPath = path.join(process.cwd(), 'scripts/dev/tail-logs.ts')
      command = ['tsx', scriptPath]
    } else {
      // Use log-viewer.ts for searching/recent logs
      scriptPath = path.join(process.cwd(), 'scripts/dev/log-viewer.ts')
      command = ['tsx', scriptPath]
    }

    // Add filters as arguments
    if (filter) {
      command.push('--grep', filter)
    }
    if (level) {
      command.push('--level', level)
    }
    if (since) {
      command.push('--since', since)
    }
    if (limit) {
      command.push('--limit', limit.toString())
    }

    const output = await this.runScript('npx', command)

    return {
      content: [
        {
          type: 'text',
          text: `**Logs (${action})**\n\n\`\`\`\n${output}\n\`\`\``,
        },
      ],
    }
  }

  private async runLint(args: any) {
    const { quiet = true, fix = false } = args

    const command = ['eslint', '.']
    if (quiet) {
      command.push('--quiet')
    }
    if (fix) {
      command.push('--fix')
    }

    try {
      const output = await this.runScript('npx', command)
      return {
        content: [
          {
            type: 'text',
            text: `**Lint Results**\n\n✅ No errors found!\n\n\`\`\`\n${output || '(no output)'}\n\`\`\``,
          },
        ],
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      return {
        content: [
          {
            type: 'text',
            text: `**Lint Results**\n\n❌ Errors found:\n\n\`\`\`\n${errorMsg}\n\`\`\``,
          },
        ],
      }
    }
  }

  // TODO(human): Add methods to call other diagnostic scripts
  // For example:
  // - callSchedulerDebug() - wrap scripts/tools/diagnostics/debug-scheduler-state.ts
  // - callCapacityTrace() - wrap scripts/tools/diagnostics/trace-capacity.ts
  // - callHealthCheck() - create a health check that runs multiple diagnostic scripts

  private async runScript(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: process.cwd(),
      })

      let stdout = ''
      let stderr = ''

      childProcess.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      childProcess.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      childProcess.on('close', (code) => {
        if (code === 0) {
          resolve(stdout)
        } else {
          // Include both stdout and stderr in error message
          // (db-inspector uses console.log for errors, which goes to stdout)
          const errorMsg = stderr || stdout || 'No output'
          reject(new Error(`Script failed with code ${code}: ${errorMsg}`))
        }
      })

      childProcess.on('error', (error) => {
        reject(error)
      })
    })
  }

  async start() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const server = new DiagnosticWrapper()
  server.start().catch(console.error)
}

export { DiagnosticWrapper }
