#!/usr/bin/env npx tsx
/**
 * Script to reply to specific PR review comments
 * Usage: npx tsx scripts/pr/pr-comment-reply.ts <pr-number> <comment-id> "reply text"
 * Or: npx tsx scripts/pr/pr-comment-reply.ts <pr-number> --list (to list all comments with IDs)
 */

import { execSync } from 'child_process'

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
}

function exec(command: string): string {
  try {
    return execSync(command, { encoding: 'utf-8' }).trim()
  } catch (error) {
    console.error(`${colors.red}Error executing command:${colors.reset}`, command)
    throw error
  }
}

function listComments(prNumber: string) {
  console.log(`\n${colors.cyan}${colors.bright}Fetching comments for PR #${prNumber}...${colors.reset}\n`)

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

  console.log(`${colors.cyan}To reply to a comment, use:${colors.reset}`)
  console.log(`npx tsx scripts/pr/pr-comment-reply.ts ${prNumber} <comment-id> "your reply"`)
}

function replyToComment(prNumber: string, commentId: string, replyText: string) {
  console.log(`\n${colors.cyan}Replying to comment ${commentId} on PR #${prNumber}...${colors.reset}\n`)

  try {
    // Create the reply using gh API

    const result = exec(
      `gh api repos/{owner}/{repo}/pulls/${prNumber}/comments/${commentId}/replies \
       --method POST \
       --field body="${replyText.replace(/"/g, '\\"')}"`,
    )

    console.log(`${colors.green}✅ Reply posted successfully!${colors.reset}`)

    // Parse and show the created reply
    const replyData = JSON.parse(result)
    console.log(`\n${colors.bright}Reply URL:${colors.reset} ${replyData.html_url}`)
    console.log(`${colors.bright}Reply text:${colors.reset}\n${replyData.body}`)

  } catch (_error: any) {
    // If the reply endpoint doesn't work, try creating a new review comment
    console.log(`${colors.yellow}Reply endpoint not available, creating review comment...${colors.reset}`)

    try {
      // First get the comment details to get the commit SHA and position
      const commentJson = exec(`gh api repos/{owner}/{repo}/pulls/comments/${commentId}`)
      const comment = JSON.parse(commentJson)

      const result = exec(
        `gh api repos/{owner}/{repo}/pulls/${prNumber}/comments \
         --method POST \
         --field body="${replyText.replace(/"/g, '\\"')}" \
         --field commit_id="${comment.commit_id}" \
         --field path="${comment.path}" \
         --field line=${comment.line || comment.original_line} \
         --field side="${comment.side || 'RIGHT'}" \
         --field in_reply_to=${commentId}`,
      )

      console.log(`${colors.green}✅ Reply posted successfully!${colors.reset}`)
      const replyData = JSON.parse(result)
      console.log(`\n${colors.bright}Reply URL:${colors.reset} ${replyData.html_url}`)

    } catch (error2: any) {
      console.error(`${colors.red}Failed to post reply:${colors.reset}`, error2.message)
      console.log(`\n${colors.yellow}You may need to reply directly on GitHub.${colors.reset}`)
    }
  }
}

// Main execution
const args = process.argv.slice(2)

if (args.length < 2) {
  console.log(`${colors.yellow}Usage:${colors.reset}`)
  console.log('  List comments:  npx tsx scripts/pr/pr-comment-reply.ts <pr-number> --list')
  console.log('  Reply:          npx tsx scripts/pr/pr-comment-reply.ts <pr-number> <comment-id> "reply text"')
  process.exit(1)
}

const prNumber = args[0]

if (args[1] === '--list') {
  listComments(prNumber)
} else if (args.length >= 3) {
  const commentId = args[1]
  const replyText = args.slice(2).join(' ')
  replyToComment(prNumber, commentId, replyText)
} else {
  console.error(`${colors.red}Invalid arguments. Use --list or provide comment-id and reply text.${colors.reset}`)
  process.exit(1)
}
