#!/usr/bin/env node
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
                  enum: ['tasks', 'sessions', 'capacity', 'stats', 'patterns'],
                  description: 'Database inspection operation',
                },
                params: {
                  type: 'string',
                  description: 'Additional parameters (e.g., session name, date)',
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
      command.push(params)
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

  // TODO(human): Add methods to call other diagnostic scripts
  // For example:
  // - callSchedulerDebug() - wrap scripts/tools/diagnostics/debug-scheduler-state.ts
  // - callCapacityTrace() - wrap scripts/tools/diagnostics/trace-capacity.ts
  // - callHealthCheck() - create a health check that runs multiple diagnostic scripts

  private async runScript(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: process.cwd(),
      })

      let stdout = ''
      let stderr = ''

      process.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      process.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(`Script failed with code ${code}: ${stderr}`))
        }
      })

      process.on('error', (error) => {
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
