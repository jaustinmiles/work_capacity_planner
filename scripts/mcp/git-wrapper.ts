#!/usr/bin/env npx tsx
/**
 * Git MCP Wrapper
 *
 * Wraps existing PR and git scripts to enforce systematic PR workflow.
 * Prevents ad-hoc git operations by providing structured alternatives.
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

class GitWrapper {
  private server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'git-wrapper',
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
            name: 'setup_bot_auth',
            description: 'Set up Claude bot authentication for GitHub operations',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'create_feature_branch',
            description: 'Create and switch to new feature branch',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Feature branch name (without feature/ prefix)',
                },
              },
              required: ['name'],
            },
          },
          {
            name: 'commit_changes',
            description: 'Add and commit changes with proper message',
            inputSchema: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'Commit message',
                },
                files: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Specific files to commit (optional, commits all if not specified)',
                },
              },
              required: ['message'],
            },
          },
          {
            name: 'push_and_create_pr',
            description: 'Push branch and create PR using bot authentication',
            inputSchema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'PR title',
                },
                body: {
                  type: 'string',
                  description: 'PR description',
                },
              },
              required: ['title', 'body'],
            },
          },
          {
            name: 'get_pr_reviews',
            description: 'Get PR review comments using pr-review-tracker.ts',
            inputSchema: {
              type: 'object',
              properties: {
                prNumber: {
                  type: 'number',
                  description: 'PR number to check reviews for',
                },
                showReplies: {
                  type: 'boolean',
                  description: 'Show full comment threads with all replies (default: false)',
                },
              },
              required: ['prNumber'],
            },
          },
          {
            name: 'reply_to_comment',
            description: 'Reply to PR review comment using pr-comment-reply.ts',
            inputSchema: {
              type: 'object',
              properties: {
                prNumber: {
                  type: 'number',
                  description: 'PR number',
                },
                commentId: {
                  type: 'string',
                  description: 'Comment ID to reply to',
                },
                reply: {
                  type: 'string',
                  description: 'Reply message',
                },
              },
              required: ['prNumber', 'commentId', 'reply'],
            },
          },
          {
            name: 'health_check',
            description: 'Run PR health check using pr-health-check.ts',
            inputSchema: {
              type: 'object',
              properties: {
                fix: {
                  type: 'boolean',
                  description: 'Whether to auto-fix issues',
                  default: false,
                },
              },
            },
          },
          {
            name: 'push_changes',
            description: 'Push committed changes to current branch',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ] satisfies Tool[],
      }
    })

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
          case 'setup_bot_auth':
            return await this.setupBotAuth()

          case 'create_feature_branch':
            return await this.createFeatureBranch(args.name as string)

          case 'commit_changes':
            return await this.commitChanges(args.message as string, args.files as string[])

          case 'push_and_create_pr':
            return await this.pushAndCreatePR(args.title as string, args.body as string)

          case 'get_pr_reviews':
            return await this.getPRReviews(args.prNumber as number, args.showReplies as boolean)

          case 'reply_to_comment':
            return await this.replyToComment(args.prNumber as number, args.commentId as string, args.reply as string)

          case 'health_check':
            return await this.healthCheck(args.fix as boolean)

          case 'push_changes':
            return await this.pushChanges()

          default:
            throw new Error(`Unknown tool: ${name}`)
        }
      } catch (error) {
        // Show full error including stack for git command failures
        const errorText = error instanceof Error
          ? error.message
          : String(error)

        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorText}`,
            },
          ],
          isError: true,
        }
      }
    })
  }

  private async setupBotAuth() {
    const scriptPath = path.join(process.cwd(), 'context/setup-claude-bot.sh')
    const output = await this.runScript('bash', [scriptPath])

    return {
      content: [
        {
          type: 'text',
          text: `**Bot Authentication Setup**\n\n\`\`\`\n${output}\n\`\`\`\n\n✅ Ready for GitHub operations`,
        },
      ],
    }
  }

  private async createFeatureBranch(name: string) {
    // Stash any uncommitted changes
    await this.runScript('git', ['stash'])

    // Switch to main and update
    await this.runScript('git', ['switch', 'main'])
    await this.runScript('git', ['fetch'])
    await this.runScript('git', ['pull'])

    // Create new feature branch
    const branchName = `feature/${name}`
    await this.runScript('git', ['checkout', '-b', branchName])

    // Restore stashed changes
    try {
      await this.runScript('git', ['stash', 'pop'])
    } catch (_error) {
      // If stash pop fails (e.g., no stash), that's okay - continue
    }

    return {
      content: [
        {
          type: 'text',
          text: `✅ Created and switched to branch: **${branchName}**\n\nStashed changes restored. Ready to start development.`,
        },
      ],
    }
  }

  private async commitChanges(message: string, files?: string[]) {
    // Check if on protected branch
    const currentBranch = (await this.runScript('git', ['branch', '--show-current'])).trim()
    const protectedBranches = ['main', 'master']

    if (protectedBranches.includes(currentBranch)) {
      throw new Error(`❌ Cannot commit directly to protected branch "${currentBranch}".\n\n` +
        'REQUIRED WORKFLOW:\n' +
        '1. Create a feature branch: mcp__git__create_feature_branch\n' +
        '2. Commit your changes to that branch\n' +
        '3. Create a PR: mcp__git__push_and_create_pr\n\n' +
        'This enforces the "Feature Branches Only" and "PRs Required" rules from CLAUDE.md')
    }

    if (files && files.length > 0) {
      // Add specific files
      for (const file of files) {
        await this.runScript('git', ['add', file])
      }
    } else {
      // Add all changes
      await this.runScript('git', ['add', '-A'])
    }

    const commitMessage = `${message}

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>`

    await this.runScript('git', ['commit', '-m', commitMessage])

    // Get commit info
    const commitInfo = await this.runScript('git', ['log', '-1', '--oneline'])

    return {
      content: [
        {
          type: 'text',
          text: `✅ Committed changes:\n\n\`\`\`\n${commitInfo}\n\`\`\`\n\nMessage: "${message}"`,
        },
      ],
    }
  }

  private async pushAndCreatePR(title: string, body: string) {
    // First ensure bot auth is set up
    await this.setupBotAuth()

    // Get current branch
    const currentBranch = (await this.runScript('git', ['branch', '--show-current'])).trim()

    // Push branch with upstream
    await this.runScript('git', ['push', '-u', 'origin', currentBranch])

    // Create PR using GitHub CLI with bot account
    const prBody = `${body}

🤖 Generated with [Claude Code](https://claude.ai/code)`

    const output = await this.runScript('gh', [
      'pr', 'create',
      '--title', title,
      '--body', prBody,
    ])

    // Extract PR number from output
    const prMatch = output.match(/\/pull\/(\d+)/)
    const prNumber = prMatch ? prMatch[1] : 'unknown'

    return {
      content: [
        {
          type: 'text',
          text: `✅ **PR Created Successfully**\n\n**Branch:** ${currentBranch}\n**Title:** ${title}\n**PR #:** ${prNumber}\n\n${output}`,
        },
      ],
    }
  }

  private async getPRReviews(prNumber: number, showReplies?: boolean) {
    const scriptPath = path.join(process.cwd(), 'scripts/pr/pr-review-tracker.ts')
    const args = [prNumber.toString()]
    if (showReplies) {
      args.push('--show-replies')
    }
    const output = await this.runScript('npx', ['tsx', scriptPath, ...args])

    return {
      content: [
        {
          type: 'text',
          text: `**PR #${prNumber} Review Status**\n\n\`\`\`\n${output}\n\`\`\``,
        },
      ],
    }
  }

  private async replyToComment(prNumber: number, commentId: string, reply: string) {
    const scriptPath = path.join(process.cwd(), 'scripts/pr/pr-comment-reply.ts')

    try {
      const output = await this.runScript('npx', [
        'tsx',
        scriptPath,
        prNumber.toString(),
        commentId,
        reply,
      ])

      return {
        content: [
          {
            type: 'text',
            text: `✅ **Reply Posted**\n\nPR #${prNumber}, Comment ID: ${commentId}\n\n\`\`\`\n${output}\n\`\`\``,
          },
        ],
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ **Failed to Post Reply**\n\nPR #${prNumber}, Comment ID: ${commentId}\n\n**Error:** ${error.message}\n\n\`\`\`\n${error.toString()}\n\`\`\``,
          },
        ],
      }
    }
  }

  private async healthCheck(fix: boolean = false) {
    const scriptPath = path.join(process.cwd(), 'scripts/dev/pr-health-check.ts')
    const args = ['tsx', scriptPath]
    if (fix) {
      args.push('--fix')
    }

    const output = await this.runScript('npx', args)

    return {
      content: [
        {
          type: 'text',
          text: `**PR Health Check${fix ? ' (with auto-fix)' : ''}**\n\n\`\`\`\n${output}\n\`\`\``,
        },
      ],
    }
  }

  private async pushChanges() {
    // Check if on protected branch
    const currentBranch = (await this.runScript('git', ['branch', '--show-current'])).trim()
    const protectedBranches = ['main', 'master']

    if (protectedBranches.includes(currentBranch)) {
      throw new Error(`❌ Cannot push directly to protected branch "${currentBranch}".\n\n` +
        'REQUIRED WORKFLOW:\n' +
        '1. Create a feature branch: mcp__git__create_feature_branch\n' +
        '2. Commit and push to that branch\n' +
        '3. Create a PR: mcp__git__push_and_create_pr\n\n' +
        'This enforces the "Feature Branches Only" and "PRs Required" rules from CLAUDE.md')
    }

    const args = ['push', '-u', 'origin', 'HEAD']
    const output = await this.runScript('git', args)
    const truncatedOutput = this.truncateOutput(output, 5000)

    return {
      content: [
        {
          type: 'text',
          text: `✅ **Changes Pushed**\n\n\`\`\`\n${truncatedOutput}\n\`\`\``,
        },
      ],
    }
  }

  private truncateOutput(output: string, maxChars: number = 10000): string {
    if (output.length <= maxChars) {
      return output
    }

    const lines = output.split('\n')
    const headLines = 50
    const tailLines = 20

    if (lines.length <= headLines + tailLines) {
      return output
    }

    const head = lines.slice(0, headLines).join('\n')
    const tail = lines.slice(-tailLines).join('\n')
    const omitted = lines.length - headLines - tailLines

    return `${head}\n\n... [${omitted} lines truncated] ...\n\n${tail}`
  }

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
          // Include both stdout and stderr for better error context
          const errorOutput = [stderr, stdout].filter(Boolean).join('\n')
          reject(new Error(`Command failed with code ${code}:\n${errorOutput}`))
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
  const server = new GitWrapper()
  server.start().catch(console.error)
}

export { GitWrapper }
