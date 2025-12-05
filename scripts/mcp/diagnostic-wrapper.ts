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
import {
  getCoverageSummary,
  getCoverageByModule,
  getUncoveredFiles,
  getFileCoverage,
  getPatchCoverage,
  coverageExists,
} from './coverage-utils.js'

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
                  enum: ['high', 'unresolved', 'summary', 'by-type'],
                  description: 'Type of feedback query (use by-type with type parameter)',
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
          {
            name: 'typecheck',
            description: 'Run TypeScript type checking',
            inputSchema: {
              type: 'object',
              properties: {
                quiet: {
                  type: 'boolean',
                  description: 'Only show errors, no warnings (default: true)',
                  default: true,
                },
              },
            },
          },
          {
            name: 'run_tests',
            description: 'Run all tests using npm test',
            inputSchema: {
              type: 'object',
              properties: {
                watch: {
                  type: 'boolean',
                  description: 'Run tests in watch mode (default: false)',
                  default: false,
                },
                coverage: {
                  type: 'boolean',
                  description: 'Run tests with coverage reporting (default: false)',
                  default: false,
                },
              },
            },
          },
          {
            name: 'run_test_file',
            description: 'Run a specific test file',
            inputSchema: {
              type: 'object',
              properties: {
                file: {
                  type: 'string',
                  description: 'Path to the test file (e.g., "src/renderer/utils/__tests__/amendment-applicator.test.ts")',
                },
                watch: {
                  type: 'boolean',
                  description: 'Run test in watch mode (default: false)',
                  default: false,
                },
              },
              required: ['file'],
            },
          },
          // Coverage tools
          {
            name: 'get_coverage_summary',
            description: 'Get overall code coverage metrics (lines, statements, functions, branches). Returns percentages matching CI/Codecov.',
            inputSchema: {
              type: 'object',
              properties: {
                runTests: {
                  type: 'boolean',
                  description: 'Run tests first to generate fresh coverage (default: false, uses cached)',
                  default: false,
                },
              },
            },
          },
          {
            name: 'get_coverage_by_module',
            description: 'Get coverage breakdown by source module (shared, main, renderer, logger)',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_uncovered_files',
            description: 'Get files with lowest coverage, sorted by improvement impact potential',
            inputSchema: {
              type: 'object',
              properties: {
                module: {
                  type: 'string',
                  enum: ['main', 'renderer', 'shared', 'logger'],
                  description: 'Filter by module (optional)',
                },
                limit: {
                  type: 'number',
                  description: 'Number of files to return (default: 10)',
                  default: 10,
                },
                minLines: {
                  type: 'number',
                  description: 'Minimum uncovered lines to include (default: 50)',
                  default: 50,
                },
              },
            },
          },
          {
            name: 'get_file_coverage',
            description: 'Get detailed coverage for a specific file including uncovered line numbers',
            inputSchema: {
              type: 'object',
              properties: {
                file: {
                  type: 'string',
                  description: 'Path to file (relative to project root)',
                },
              },
              required: ['file'],
            },
          },
          {
            name: 'get_patch_coverage',
            description: 'Get coverage for files changed since base branch (patch coverage)',
            inputSchema: {
              type: 'object',
              properties: {
                base: {
                  type: 'string',
                  description: 'Base branch to compare against (default: main)',
                  default: 'main',
                },
              },
            },
          },
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

          case 'typecheck':
            return await this.runTypecheck(args)

          case 'run_tests':
            return await this.runTests(args)

          case 'run_test_file':
            return await this.runTestFile(args)

          // Coverage tools
          case 'get_coverage_summary':
            return await this.handleGetCoverageSummary(args)

          case 'get_coverage_by_module':
            return await this.handleGetCoverageByModule()

          case 'get_uncovered_files':
            return await this.handleGetUncoveredFiles(args)

          case 'get_file_coverage':
            return await this.handleGetFileCoverage(args)

          case 'get_patch_coverage':
            return await this.handleGetPatchCoverage(args)

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

    // Add filters as arguments (using --key=value format for tail-logs.ts)
    if (filter) {
      command.push(`--grep=${filter}`)
    }
    if (level) {
      command.push(`--level=${level}`)
    }
    if (since) {
      command.push(`--since=${since}`)
    }
    if (limit) {
      command.push(`--limit=${limit}`)
    }

    // For tail action, add --no-follow to prevent hanging
    if (action === 'tail') {
      command.push('--no-follow')
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

  private async runTypecheck(_args: any) {
    try {
      // Run npm run typecheck - no quiet option available
      const output = await this.runScript('npm', ['run', 'typecheck'])

      // Count errors if any
      const errorLines = output.split('\n').filter(line => line.includes('error TS'))
      const errorCount = errorLines.length

      if (errorCount === 0) {
        return {
          content: [
            {
              type: 'text',
              text: '**TypeScript Check Results**\n\n✅ No type errors found!\n\nAll TypeScript checks passed successfully.',
            },
          ],
        }
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `**TypeScript Check Results**\n\n⚠️ Found ${errorCount} type error${errorCount > 1 ? 's' : ''}:\n\n\`\`\`\n${output}\n\`\`\``,
            },
          ],
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      // Extract just the error lines for a cleaner output
      const errorLines = errorMsg.split('\n').filter(line =>
        line.startsWith('src/') || line.includes('error TS'),
      )
      const errorCount = errorLines.filter(line => line.includes('error TS')).length

      return {
        content: [
          {
            type: 'text',
            text: `**TypeScript Check Results**\n\n❌ Found ${errorCount} type error${errorCount > 1 ? 's' : ''}:\n\n\`\`\`typescript\n${errorLines.join('\n') || errorMsg}\n\`\`\``,
          },
        ],
      }
    }
  }

  private async runTests(args: any) {
    const { watch = false, coverage = false } = args

    try {
      // Build the command based on options
      let command = 'test'
      if (coverage) {
        command = 'test:coverage'
      }

      const npmArgs = ['run', command]

      // Note: watch mode would hang, so we'll add a note about it
      if (watch) {
        return {
          content: [
            {
              type: 'text',
              text: '**Test Results**\n\n⚠️ Watch mode is not supported in MCP context as it requires interactive terminal. Running tests once instead.',
            },
          ],
        }
      }

      // Use 5 minute timeout for full test suite
      const output = await this.runScript('npm', npmArgs, 300000)

      // Parse test results from Vitest output format
      // Vitest format: "      Tests  1 failed | 1113 passed | 82 skipped (1196)"
      // Note: Must use multiline match anchored to "Tests" to avoid matching "Test Files" line
      const testsSummaryMatch = output.match(
        /^\s*Tests\s+(?:(\d+)\s+failed\s+\|\s+)?(\d+)\s+passed(?:\s+\|\s+(\d+)\s+skipped)?\s+\((\d+)\)/m,
      )

      let passed = 0
      let failed = 0
      let skipped = 0
      let total = 0

      if (testsSummaryMatch) {
        failed = testsSummaryMatch[1] ? parseInt(testsSummaryMatch[1]) : 0
        passed = parseInt(testsSummaryMatch[2])
        skipped = testsSummaryMatch[3] ? parseInt(testsSummaryMatch[3]) : 0
        total = parseInt(testsSummaryMatch[4])
      } else {
        // Fallback to individual matches if summary line not found
        const passedMatch = output.match(/Tests\s+(\d+)\s+passed/)
        const failedMatch = output.match(/(\d+)\s+failed/)
        const skippedMatch = output.match(/(\d+)\s+skipped/)
        passed = passedMatch ? parseInt(passedMatch[1]) : 0
        failed = failedMatch ? parseInt(failedMatch[1]) : 0
        skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0
        total = passed + failed + skipped
      }

      const icon = failed > 0 ? '❌' : '✅'
      const summary = failed > 0
        ? `${failed} test${failed > 1 ? 's' : ''} failed, ${passed} passed, ${total} total`
        : `All ${total} tests passed!`

      // For passing tests, just show summary
      if (failed === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `**Test Results**\n\n${icon} ${summary}`,
            },
          ],
        }
      }

      // For failures, extract only the failure sections
      const lines = output.split('\n')
      const failureLines: string[] = []
      let inFailSection = false
      let failSectionCount = 0

      for (const line of lines) {
        if (line.includes('FAIL ')) {
          inFailSection = true
          failSectionCount++
          failureLines.push(line)
        } else if (line.includes('● ') && inFailSection) {
          failureLines.push(line)
        } else if (inFailSection && (line.trim() === '' || line.includes('  ●'))) {
          failureLines.push(line)
          // Limit detail per test to prevent excessive output
          if (failureLines.length > 100 && failSectionCount > 1) {
            failureLines.push('  ... (additional test details omitted)')
            inFailSection = false
          }
        } else if (line.includes('Test Suites:') || line.includes('Tests:') || line.includes('Time:')) {
          failureLines.push(line)
          inFailSection = false
        } else if (inFailSection && line.match(/^\s+at /)) {
          // Include stack trace line but limit depth
          if (failureLines.filter(l => l.match(/^\s+at /)).length < 5) {
            failureLines.push(line)
          }
        }
      }

      const relevantOutput = failureLines.length > 0 ? failureLines.join('\n') : output
      const truncatedOutput = this.truncateOutput(relevantOutput, 8000)

      return {
        content: [
          {
            type: 'text',
            text: `**Test Results**\n\n${icon} ${summary}\n\n\`\`\`\n${truncatedOutput}\n\`\`\``,
          },
        ],
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)

      // Extract test failure information and relevant details
      const failureMatch = errorMsg.match(/(\d+)\s*failed/)
      const failedCount = failureMatch ? parseInt(failureMatch[1]) : 'unknown'

      // Extract only failed test details
      const lines = errorMsg.split('\n')
      const failureLines: string[] = []
      let inFailSection = false

      for (const line of lines) {
        if (line.includes('FAIL ') || line.includes('● ')) {
          inFailSection = true
          failureLines.push(line)
        } else if (inFailSection) {
          failureLines.push(line)
          if (line.trim() === '' && failureLines.length > 80) {
            inFailSection = false
          }
        } else if (line.includes('Test Suites:') || line.includes('Tests:')) {
          failureLines.push(line)
        }
      }

      const relevantOutput = failureLines.length > 0 ? failureLines.join('\n') : errorMsg
      const truncatedOutput = this.truncateOutput(relevantOutput, 8000)

      return {
        content: [
          {
            type: 'text',
            text: `**Test Results**\n\n❌ Test run failed (${failedCount} test${failedCount !== 1 ? 's' : ''} failed)\n\n\`\`\`\n${truncatedOutput}\n\`\`\``,
          },
        ],
      }
    }
  }

  private async runTestFile(args: any) {
    const { file, watch = false } = args

    if (!file) {
      return {
        content: [
          {
            type: 'text',
            text: '**Test Results**\n\n❌ Error: No test file specified. Please provide a file path.',
          },
        ],
      }
    }

    try {
      // Check if file exists
      const fs = require('fs')
      const path = require('path')
      const fullPath = path.join(process.cwd(), file)

      if (!fs.existsSync(fullPath)) {
        return {
          content: [
            {
              type: 'text',
              text: `**Test Results**\n\n❌ Error: Test file not found: ${file}`,
            },
          ],
        }
      }

      // Run vitest with 'run' flag to ensure non-interactive mode
      const vitestArgs = ['vitest', 'run', file, '--reporter=verbose']

      if (watch) {
        return {
          content: [
            {
              type: 'text',
              text: '**Test Results**\n\n⚠️ Watch mode is not supported in MCP context. Running test once instead.',
            },
          ],
        }
      }

      // Use 2 minute timeout for single test file
      const output = await this.runScript('npx', vitestArgs, 120000)

      // Parse test results from Vitest output format
      const passedMatch = output.match(/Tests\s+(\d+)\s+passed/)
      const failedMatch = output.match(/(\d+)\s+failed/)
      const skippedMatch = output.match(/(\d+)\s+skipped/)
      const totalMatch = output.match(/\((\d+)\)/)

      const passed = passedMatch ? parseInt(passedMatch[1]) : 0
      const failed = failedMatch ? parseInt(failedMatch[1]) : 0
      const skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0
      const total = totalMatch ? parseInt(totalMatch[1]) : (passed + failed + skipped)

      const icon = failed > 0 ? '❌' : '✅'
      const summary = failed > 0
        ? `${failed} test${failed > 1 ? 's' : ''} failed, ${passed} passed in ${file}`
        : `All ${total} test${total > 1 ? 's' : ''} passed in ${file}!`

      // For passing tests, just show summary
      if (failed === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `**Test Results for ${file}**\n\n${icon} ${summary}`,
            },
          ],
        }
      }

      // Extract failure details and truncate
      const truncatedOutput = this.truncateOutput(output, 8000)

      return {
        content: [
          {
            type: 'text',
            text: `**Test Results for ${file}**\n\n${icon} ${summary}\n\n\`\`\`\n${truncatedOutput}\n\`\`\``,
          },
        ],
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      const truncatedOutput = this.truncateOutput(errorMsg, 8000)

      return {
        content: [
          {
            type: 'text',
            text: `**Test Results for ${file}**\n\n❌ Test failed\n\n\`\`\`\n${truncatedOutput}\n\`\`\``,
          },
        ],
      }
    }
  }

  // Coverage tool implementations

  private async handleGetCoverageSummary(args: Record<string, unknown>) {
    const { runTests = false } = args

    // If runTests is requested, run tests with coverage first
    if (runTests) {
      try {
        await this.runScript('npm', ['run', 'test:coverage'], 300000)
      } catch {
        // Tests might fail but coverage is still generated
      }
    }

    if (!coverageExists()) {
      return {
        content: [
          {
            type: 'text',
            text: '**Coverage Summary**\n\n⚠️ No coverage data found. Run tests with coverage first:\n```\nmcp__diagnostic__run_tests --coverage true\n```',
          },
        ],
      }
    }

    const summary = getCoverageSummary()

    if (!summary) {
      return {
        content: [
          {
            type: 'text',
            text: '**Coverage Summary**\n\n❌ Failed to parse coverage data.',
          },
        ],
      }
    }

    const target = 40
    const gap = target - summary.lines
    const icon = summary.lines >= target ? '✅' : '⚠️'

    return {
      content: [
        {
          type: 'text',
          text: `**Coverage Summary**

${icon} **Lines**: ${summary.lines.toFixed(2)}% (target: ${target}%, gap: ${gap > 0 ? gap.toFixed(2) : 'met'}%)
📊 **Statements**: ${summary.statements.toFixed(2)}%
🔧 **Functions**: ${summary.functions.toFixed(2)}%
🌿 **Branches**: ${summary.branches.toFixed(2)}%`,
        },
      ],
    }
  }

  private async handleGetCoverageByModule() {
    if (!coverageExists()) {
      return {
        content: [
          {
            type: 'text',
            text: '**Coverage by Module**\n\n⚠️ No coverage data found. Run tests with coverage first.',
          },
        ],
      }
    }

    const modules = getCoverageByModule()

    if (modules.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: '**Coverage by Module**\n\n❌ No module coverage data found.',
          },
        ],
      }
    }

    const rows = modules.map((m) => {
      const icon = m.overall >= 80 ? '🟢' : m.overall >= 50 ? '🟡' : '🔴'
      return `${icon} **${m.name}**: ${m.lines.toFixed(1)}% lines (${m.coveredLines}/${m.totalLines}), ${m.uncoveredLines} uncovered`
    })

    return {
      content: [
        {
          type: 'text',
          text: `**Coverage by Module**\n\n${rows.join('\n')}`,
        },
      ],
    }
  }

  private async handleGetUncoveredFiles(args: Record<string, unknown>) {
    if (!coverageExists()) {
      return {
        content: [
          {
            type: 'text',
            text: '**Uncovered Files**\n\n⚠️ No coverage data found. Run tests with coverage first.',
          },
        ],
      }
    }

    const files = getUncoveredFiles({
      module: args.module as string | undefined,
      limit: (args.limit as number) ?? 10,
      minLines: (args.minLines as number) ?? 50,
    })

    if (files.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: '**Uncovered Files**\n\n✅ No files with significant uncovered lines found.',
          },
        ],
      }
    }

    const rows = files.map((f, i) => {
      return `${i + 1}. **${f.relativePath}**
   - Coverage: ${f.linesCoverage.toFixed(1)}% | Uncovered: ${f.uncoveredLines} lines | Impact: ${f.impactScore.toFixed(0)}`
    })

    return {
      content: [
        {
          type: 'text',
          text: `**Uncovered Files** (sorted by improvement impact)\n\n${rows.join('\n\n')}`,
        },
      ],
    }
  }

  private async handleGetFileCoverage(args: Record<string, unknown>) {
    const { file } = args

    if (!file || typeof file !== 'string') {
      return {
        content: [
          {
            type: 'text',
            text: '**File Coverage**\n\n❌ Error: No file specified.',
          },
        ],
      }
    }

    if (!coverageExists()) {
      return {
        content: [
          {
            type: 'text',
            text: '**File Coverage**\n\n⚠️ No coverage data found. Run tests with coverage first.',
          },
        ],
      }
    }

    const coverage = getFileCoverage(file)

    if (!coverage) {
      return {
        content: [
          {
            type: 'text',
            text: `**File Coverage**\n\n❌ No coverage data found for: ${file}\n\nThe file may be excluded from coverage or not exist.`,
          },
        ],
      }
    }

    const icon = coverage.linesCoverage >= 80 ? '🟢' : coverage.linesCoverage >= 50 ? '🟡' : '🔴'

    let output = `**File Coverage: ${file}**

${icon} **Lines**: ${coverage.linesCoverage.toFixed(1)}% (${coverage.coveredLines}/${coverage.totalLines})
📊 **Statements**: ${coverage.statementsCoverage.toFixed(1)}%
🔧 **Functions**: ${coverage.functionsCoverage.toFixed(1)}%
🌿 **Branches**: ${coverage.branchesCoverage.toFixed(1)}%`

    if (coverage.uncoveredLineRanges.length > 0) {
      const ranges = coverage.uncoveredLineRanges.slice(0, 20).join(', ')
      const more = coverage.uncoveredLineRanges.length > 20 ? ` ... and ${coverage.uncoveredLineRanges.length - 20} more ranges` : ''
      output += `\n\n**Uncovered Lines**: ${ranges}${more}`
    }

    if (coverage.uncoveredFunctions.length > 0) {
      const funcs = coverage.uncoveredFunctions.slice(0, 10).join(', ')
      const more = coverage.uncoveredFunctions.length > 10 ? ` ... and ${coverage.uncoveredFunctions.length - 10} more` : ''
      output += `\n\n**Uncovered Functions**: ${funcs}${more}`
    }

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    }
  }

  private async handleGetPatchCoverage(args: Record<string, unknown>) {
    const { base = 'main' } = args

    if (!coverageExists()) {
      return {
        content: [
          {
            type: 'text',
            text: '**Patch Coverage**\n\n⚠️ No coverage data found. Run tests with coverage first.',
          },
        ],
      }
    }

    const result = getPatchCoverage(base as string)

    if (!result) {
      return {
        content: [
          {
            type: 'text',
            text: `**Patch Coverage**\n\n❌ Failed to calculate patch coverage. Make sure you have changes compared to ${base}.`,
          },
        ],
      }
    }

    if (result.totalChangedLines === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `**Patch Coverage**\n\n✅ No changed lines found compared to ${base}.`,
          },
        ],
      }
    }

    const icon = result.patchCoverage >= 50 ? '✅' : '⚠️'
    const target = 50

    let output = `**Patch Coverage** (vs ${base})

${icon} **Coverage**: ${result.patchCoverage.toFixed(1)}% (target: ${target}%)
📊 **Changed Lines**: ${result.coveredChangedLines}/${result.totalChangedLines} covered

**Changed Files**:`

    for (const file of result.changedFiles.slice(0, 10)) {
      const fileIcon = file.coverage >= 50 ? '🟢' : file.coverage >= 25 ? '🟡' : '🔴'
      output += `\n${fileIcon} **${file.file}**: ${file.coverage.toFixed(0)}% (${file.coveredLines}/${file.addedLines} lines)`
      if (file.uncoveredLines.length > 0 && file.uncoveredLines.length <= 10) {
        output += ` - uncovered: ${file.uncoveredLines.join(', ')}`
      } else if (file.uncoveredLines.length > 10) {
        output += ` - ${file.uncoveredLines.length} uncovered lines`
      }
    }

    if (result.changedFiles.length > 10) {
      output += `\n... and ${result.changedFiles.length - 10} more files`
    }

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    }
  }

  private truncateOutput(output: string, maxChars: number): string {
    if (output.length <= maxChars) {
      return output
    }
    const truncated = output.substring(0, maxChars)
    const lastNewline = truncated.lastIndexOf('\n')
    return truncated.substring(0, lastNewline > 0 ? lastNewline : maxChars) + '\n\n... (output truncated)'
  }

  private async runScript(
    command: string,
    args: string[],
    timeoutMs: number = 120000,  // 2 min default
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: process.cwd(),
      })

      let stdout = ''
      let stderr = ''
      let killed = false
      let settled = false

      // Helper to safely settle the promise only once
      const safeResolve = (value: string) => {
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          resolve(value)
        }
      }

      const safeReject = (error: Error) => {
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          reject(error)
        }
      }

      // CRITICAL: Add timeout to prevent zombie processes
      const timeout = setTimeout(() => {
        killed = true
        childProcess.kill('SIGTERM')
        // Force kill after 5s if SIGTERM doesn't work
        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill('SIGKILL')
          }
        }, 5000)
        safeReject(new Error(`Process timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      childProcess.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      childProcess.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      childProcess.on('close', (code) => {
        if (killed) return  // Already rejected by timeout

        if (code === 0) {
          safeResolve(stdout)
        } else {
          // Include both stdout and stderr in error message
          // (db-inspector uses console.log for errors, which goes to stdout)
          const errorMsg = stderr || stdout || 'No output'
          safeReject(new Error(`Script failed with code ${code}: ${errorMsg}`))
        }
      })

      childProcess.on('error', (error) => {
        // Ensure cleanup on spawn errors
        childProcess.kill('SIGKILL')
        safeReject(error)
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
