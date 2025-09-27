#!/usr/bin/env npx tsx
/**
 * Enhanced script to manage PR review comments
 * Usage:
 *   npx tsx scripts/pr/pr-comment-reply.ts <pr-number> --list (list all comments)
 *   npx tsx scripts/pr/pr-comment-reply.ts <pr-number> --unresolved (list only unresolved comments)
 *   npx tsx scripts/pr/pr-comment-reply.ts <pr-number> <comment-id> "reply text" (reply to comment)
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m',
}

interface ReviewThread {
  isResolved: boolean
  isOutdated: boolean
  comments: {
    nodes: Array<{
      id: string
      body: string
      author: { login: string }
      createdAt: string
      path: string
      line: number | null
      originalLine: number | null
      startLine: number | null
      originalStartLine: number | null
      diffHunk: string
    }>
  }
}

interface PullRequestData {
  repository: {
    pullRequest: {
      reviewThreads: {
        nodes: ReviewThread[]
      }
    }
  }
}

function exec(command: string): string {
  try {
    return execSync(command, { encoding: 'utf-8' }).trim()
  } catch (error) {
    console.error(`${colors.red}Error executing command:${colors.reset}`, command)
    throw error
  }
}

function getCodeSnippet(filePath: string, lineNumber: number | null, diffHunk?: string): string {
  if (!lineNumber) {
    return diffHunk ? `\n${colors.gray}${diffHunk}${colors.reset}` : ''
  }

  try {
    const fullPath = path.resolve(process.cwd(), filePath)
    if (!fs.existsSync(fullPath)) {
      return diffHunk ? `\n${colors.gray}${diffHunk}${colors.reset}` : `\n${colors.red}File not found: ${filePath}${colors.reset}`
    }

    const fileContent = fs.readFileSync(fullPath, 'utf-8')
    const lines = fileContent.split('\n')
    const startLine = Math.max(0, lineNumber - 3)
    const endLine = Math.min(lines.length, lineNumber + 2)

    let snippet = `\n${colors.gray}Code context (${filePath}:${lineNumber}):${colors.reset}\n`
    for (let i = startLine; i < endLine; i++) {
      const isTargetLine = i === lineNumber - 1
      const lineNum = `${i + 1}`.padStart(4, ' ')
      const prefix = isTargetLine ? `${colors.yellow}→${colors.reset}` : ' '
      const lineColor = isTargetLine ? colors.yellow : colors.gray
      snippet += `${prefix} ${lineColor}${lineNum}${colors.reset} ${lines[i]}\n`
    }
    return snippet
  } catch (error) {
    return diffHunk ? `\n${colors.gray}${diffHunk}${colors.reset}` : `\n${colors.red}Error reading file: ${error}${colors.reset}`
  }
}

function listComments(prNumber: string, unresolvedOnly: boolean = false) {
  const filterText = unresolvedOnly ? 'unresolved ' : ''
  console.log(`\n${colors.cyan}${colors.bright}Fetching ${filterText}comments for PR #${prNumber}...${colors.reset}\n`)

  try {
    // Use GraphQL API to get detailed review thread information
    const graphQLQuery = `query {
      repository(owner:"jaustinmiles", name:"work_capacity_planner") {
        pullRequest(number: ${prNumber}) {
          reviewThreads(first: 100) {
            nodes {
              isResolved
              isOutdated
              comments(first: 100) {
                nodes {
                  id
                  body
                  author { login }
                  createdAt
                  path
                  line
                  originalLine
                  startLine
                  originalStartLine
                  diffHunk
                }
              }
            }
          }
        }
      }
    }`

    // Write query to temp file to avoid shell escaping issues
    const queryFile = '/tmp/pr-query.graphql'
    require('fs').writeFileSync(queryFile, graphQLQuery)

    const result = exec(`gh api graphql -F query=@${queryFile}`)
    exec(`rm -f ${queryFile}`)
    const response = JSON.parse(result)
    const data = response as { data: PullRequestData }

    if (!data.data?.repository?.pullRequest?.reviewThreads?.nodes) {
      console.log(`${colors.yellow}No review threads found for PR #${prNumber}${colors.reset}`)
      return
    }

    let threads = data.data.repository.pullRequest.reviewThreads.nodes

    // Filter for unresolved comments if requested
    if (unresolvedOnly) {
      threads = threads.filter(thread => !thread.isResolved)
    }

    if (threads.length === 0) {
      console.log(`${colors.yellow}No ${filterText}comments found for PR #${prNumber}${colors.reset}`)
      return
    }

    console.log(`${colors.green}Found ${threads.length} ${filterText}comment thread(s):${colors.reset}\n`)

    threads.forEach((thread, threadIndex) => {
      const statusColor = thread.isResolved ? colors.green : colors.red
      const statusText = thread.isResolved ? '✅ RESOLVED' : '❌ UNRESOLVED'
      const outdatedText = thread.isOutdated ? ` (${colors.gray}OUTDATED${colors.reset})` : ''

      console.log(`${colors.bright}[${threadIndex + 1}] Thread Status: ${statusColor}${statusText}${colors.reset}${outdatedText}`)
      console.log(`${colors.gray}${'─'.repeat(60)}${colors.reset}`)

      thread.comments.nodes.forEach((comment, commentIndex) => {
        const lineInfo = comment.line || comment.originalLine || comment.startLine || comment.originalStartLine
        const lineDisplay = lineInfo ? `:${lineInfo}` : ''

        console.log(`${colors.bright}  Comment ${commentIndex + 1} - ID: ${comment.id}${colors.reset}`)
        console.log(`${colors.blue}  File:${colors.reset} ${comment.path || 'General PR comment'}${lineDisplay}`)
        console.log(`${colors.blue}  Author:${colors.reset} ${comment.author.login}`)
        console.log(`${colors.blue}  Created:${colors.reset} ${new Date(comment.createdAt).toLocaleString()}`)

        // Show code snippet if it's a line comment
        if (comment.path && lineInfo) {
          console.log(getCodeSnippet(comment.path, lineInfo, comment.diffHunk))
        }

        console.log(`${colors.gray}  ┌─ Comment:${colors.reset}`)
        comment.body.split('\n').forEach(line => {
          console.log(`${colors.gray}  │${colors.reset} ${line}`)
        })
        console.log(`${colors.gray}  └${'─'.repeat(50)}${colors.reset}`)

        if (commentIndex < thread.comments.nodes.length - 1) {
          console.log(`${colors.gray}  ↓ Reply ↓${colors.reset}`)
        }
      })

      console.log() // Empty line between threads
    })

    console.log(`${colors.cyan}To reply to a comment, use:${colors.reset}`)
    console.log(`npx tsx scripts/pr/pr-comment-reply.ts ${prNumber} <comment-id> "your reply"`)
  } catch (error) {
    console.error(`${colors.red}Error fetching comments:${colors.reset}`, error)
    console.log(`${colors.yellow}Falling back to basic API...${colors.reset}`)
    listCommentsBasic(prNumber)
  }
}

function listCommentsBasic(prNumber: string) {
  const commentsJson = exec(`gh api repos/{owner}/{repo}/pulls/${prNumber}/comments`)
  const comments = JSON.parse(commentsJson)

  if (comments.length === 0) {
    console.log(`${colors.yellow}No inline comments found for PR #${prNumber}${colors.reset}`)
    return
  }

  console.log(`${colors.green}Found ${comments.length} comment(s):${colors.reset}\n`)

  comments.forEach((comment: any, index: number) => {
    console.log(`${colors.bright}[${index + 1}] Comment ID: ${comment.id}${colors.reset}`)
    console.log(`${colors.blue}File:${colors.reset} ${comment.path}:${comment.line || comment.original_line}`)
    console.log(`${colors.blue}Author:${colors.reset} ${comment.user.login}`)
    console.log(`${colors.blue}Created:${colors.reset} ${new Date(comment.created_at).toLocaleString()}`)
    console.log(`${colors.gray}────────────────────────────────────────${colors.reset}`)
    console.log(comment.body)
    console.log(`${colors.gray}────────────────────────────────────────${colors.reset}\n`)
  })
}

function replyToComment(prNumber: string, commentId: string, replyText: string) {
  console.log(`\n${colors.cyan}Replying to comment ${commentId} on PR #${prNumber}...${colors.reset}\n`)

  try {
    // First, find the thread ID that contains this comment using GraphQL
    const findThreadQuery = `query {
      repository(owner:"jaustinmiles", name:"work_capacity_planner") {
        pullRequest(number: ${prNumber}) {
          reviewThreads(first: 100) {
            nodes {
              id
              comments(first: 100) {
                nodes {
                  id
                }
              }
            }
          }
        }
      }
    }`

    const queryFile = '/tmp/pr-find-thread.graphql'
    require('fs').writeFileSync(queryFile, findThreadQuery)
    const searchResult = exec(`gh api graphql -F query=@${queryFile}`)
    exec(`rm -f ${queryFile}`)

    const searchData = JSON.parse(searchResult)
    let threadId: string | null = null

    // Find the thread that contains our comment
    for (const thread of searchData.data.repository.pullRequest.reviewThreads.nodes) {
      for (const comment of thread.comments.nodes) {
        if (comment.id === commentId) {
          threadId = thread.id
          break
        }
      }
      if (threadId) break
    }

    if (!threadId) {
      throw new Error(`Could not find thread for comment ${commentId}`)
    }

    // Use GraphQL mutation to add reply to the thread
    const replyMutation = `mutation {
      addPullRequestReviewThreadReply(input: {
        pullRequestReviewThreadId: "${threadId}"
        body: "${replyText.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"
      }) {
        comment {
          id
          body
          url
        }
      }
    }`

    const mutationFile = '/tmp/pr-reply-mutation.graphql'
    require('fs').writeFileSync(mutationFile, replyMutation)
    const result = exec(`gh api graphql -F query=@${mutationFile}`)
    exec(`rm -f ${mutationFile}`)

    const response = JSON.parse(result)

    if (response.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`)
    }

    console.log(`${colors.green}✅ Reply posted successfully!${colors.reset}`)
    if (response.data?.addPullRequestReviewThreadReply?.comment?.url) {
      console.log(`\n${colors.bright}Reply URL:${colors.reset} ${response.data.addPullRequestReviewThreadReply.comment.url}`)
    }
    console.log(`${colors.bright}Reply posted to thread containing comment ${commentId}${colors.reset}`)

  } catch (error: any) {
    console.error(`${colors.red}Failed to post reply:${colors.reset}`, error.message)
    console.error(`${colors.red}Error details:${colors.reset}`, error.stderr || error.stdout)
    console.log(`\n${colors.yellow}Make sure the comment ID ${commentId} is correct.${colors.reset}`)
    process.exit(1)
  }
}

// Main execution
const args = process.argv.slice(2)

if (args.length < 2) {
  console.log(`${colors.yellow}Usage:${colors.reset}`)
  console.log('  List all comments:      npx tsx scripts/pr/pr-comment-reply.ts <pr-number> --list')
  console.log('  List unresolved only:   npx tsx scripts/pr/pr-comment-reply.ts <pr-number> --unresolved')
  console.log('  Reply to comment:       npx tsx scripts/pr/pr-comment-reply.ts <pr-number> <comment-id> "reply text"')
  process.exit(1)
}

const prNumber = args[0]

if (args[1] === '--list') {
  listComments(prNumber, false)
} else if (args[1] === '--unresolved') {
  listComments(prNumber, true)
} else if (args.length >= 3) {
  const commentId = args[1]
  const replyText = args.slice(2).join(' ')
  replyToComment(prNumber, commentId, replyText)
} else {
  console.error(`${colors.red}Invalid arguments. Use --list, --unresolved, or provide comment-id and reply text.${colors.reset}`)
  process.exit(1)
}
