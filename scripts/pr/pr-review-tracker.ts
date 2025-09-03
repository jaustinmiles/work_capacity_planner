#!/usr/bin/env npx tsx
/**
 * Script to fetch, format, and track all PR review comments
 * Ensures no review feedback is missed
 * Usage: npx tsx scripts/pr-review-tracker.ts [pr-number]
 */

import { execSync } from 'child_process'

interface ReviewComment {
  id: number
  path: string
  line?: number
  body: string
  user: string
  created_at: string
  html_url: string
  in_reply_to_id?: number
  position?: number
  resolved?: boolean
}

interface Review {
  id: number
  user: string
  body: string
  state: string
  submitted_at: string
  html_url: string
}

function runCommand(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8' }).trim()
  } catch (error) {
    console.error(`Failed to run command: ${cmd}`)
    console.error(error)
    process.exit(1)
  }
}

function formatComment(comment: ReviewComment, index: number): string {
  const status = comment.resolved ? '✅' : '❌'
  const location = comment.path ? `${comment.path}:${comment.line || '?'}` : 'General'

  return `
${status} [${index}] ${comment.user} - ${location}
────────────────────────────────────────────
${comment.body}
URL: ${comment.html_url}
Created: ${new Date(comment.created_at).toLocaleString()}
────────────────────────────────────────────`
}

function formatReview(review: Review): string {
  const stateEmoji = {
    'APPROVED': '✅',
    'CHANGES_REQUESTED': '🔴',
    'COMMENTED': '💬',
    'PENDING': '⏳',
    'DISMISSED': '❌',
  }[review.state] || '❓'

  return `
${stateEmoji} REVIEW by ${review.user} - ${review.state}
════════════════════════════════════════════════
${review.body || '(No review body)'}
URL: ${review.html_url}
Submitted: ${new Date(review.submitted_at).toLocaleString()}
════════════════════════════════════════════════`
}

async function main(): Promise<void> {
  const prNumber = process.argv[2]

  if (!prNumber) {
    // Try to get PR number from current branch
    const prListJson = runCommand('gh pr list --head $(git branch --show-current) --json number --limit 1')
    const prList = JSON.parse(prListJson || '[]')
    if (prList.length === 0) {
      console.error('No PR number provided and no PR found for current branch')
      console.error('Usage: npx tsx scripts/pr-review-tracker.ts [pr-number]')
      process.exit(1)
    }
    const detectedPr = prList[0].number
    console.log(`No PR specified, using PR #${detectedPr} for current branch\n`)
  }

  const pr = prNumber || runCommand('gh pr list --head $(git branch --show-current) --json number --limit 1 | jq -r ".[0].number"')

  console.log('═══════════════════════════════════════════════════════════')
  console.log(`   PR #${pr} - REVIEW FEEDBACK TRACKER`)
  console.log('═══════════════════════════════════════════════════════════')
  console.log()

  // Get PR details
  const prDetailsJson = runCommand(`gh pr view ${pr} --json title,author,state,url`)
  const prDetails = JSON.parse(prDetailsJson)
  console.log(`Title: ${prDetails.title}`)
  console.log(`Author: ${prDetails.author.login}`)
  console.log(`Status: ${prDetails.state}`)
  console.log(`URL: ${prDetails.url}`)
  console.log()

  // Get all reviews
  console.log('📝 REVIEWS')
  console.log('───────────────────────────────────────────────────────────')
  const reviewsJson = runCommand(`gh api repos/{owner}/{repo}/pulls/${pr}/reviews`)
  const reviews: Review[] = JSON.parse(reviewsJson).map((r: any) => ({
    id: r.id,
    user: r.user.login,
    body: r.body,
    state: r.state,
    submitted_at: r.submitted_at,
    html_url: r.html_url,
  }))

  if (reviews.length === 0) {
    console.log('No reviews yet')
  } else {
    reviews.forEach(review => {
      console.log(formatReview(review))
    })
  }

  // Get all inline comments
  console.log('\n💬 INLINE COMMENTS')
  console.log('───────────────────────────────────────────────────────────')
  const commentsJson = runCommand(`gh api repos/{owner}/{repo}/pulls/${pr}/comments`)
  const comments: ReviewComment[] = JSON.parse(commentsJson).map((c: any) => ({
    id: c.id,
    path: c.path,
    line: c.line || c.original_line,
    body: c.body,
    user: c.user.login,
    created_at: c.created_at,
    html_url: c.html_url,
    in_reply_to_id: c.in_reply_to_id,
    position: c.position,
  }))

  // Filter out replies (they have in_reply_to_id)
  const topLevelComments = comments.filter(c => !c.in_reply_to_id)
  const replies = comments.filter(c => c.in_reply_to_id)

  if (topLevelComments.length === 0) {
    console.log('No inline comments')
  } else {
    topLevelComments.forEach((comment, index) => {
      console.log(formatComment(comment, index + 1))

      // Show replies
      const commentReplies = replies.filter(r => r.in_reply_to_id === comment.id)
      if (commentReplies.length > 0) {
        console.log('  └─ Replies:')
        commentReplies.forEach(reply => {
          console.log(`     • ${reply.user}: ${reply.body.substring(0, 100)}...`)
        })
      }
    })
  }

  // Generate action items
  console.log('\n🎯 ACTION ITEMS')
  console.log('───────────────────────────────────────────────────────────')

  const actionItems: string[] = []
  let itemCount = 1

  // Check for changes requested
  const changesRequested = reviews.filter(r => r.state === 'CHANGES_REQUESTED')
  if (changesRequested.length > 0) {
    console.log('⚠️  Changes Requested by reviewers - must be addressed!')
  }

  // Parse comments for action items
  topLevelComments.forEach((comment) => {
    const isQuestion = comment.body.includes('?')
    const isRequest = comment.body.match(/should|must|need|please|can you|could you|let's/i)
    const isConcern = comment.body.match(/concern|issue|problem|bug|error|wrong/i)

    if (isQuestion || isRequest || isConcern) {
      const type = isQuestion ? '❓ Question' : isRequest ? '📝 Request' : '⚠️  Concern'
      actionItems.push(`${itemCount}. ${type} from ${comment.user} at ${comment.path}:${comment.line}`)
      console.log(`${itemCount}. ${type} from ${comment.user}`)
      console.log(`   Location: ${comment.path}:${comment.line}`)
      console.log(`   Summary: ${comment.body.substring(0, 100)}...`)
      console.log()
      itemCount++
    }
  })

  if (actionItems.length === 0) {
    console.log('✅ No action items found')
  }

  // Summary
  console.log('\n📊 SUMMARY')
  console.log('───────────────────────────────────────────────────────────')
  console.log(`Total Reviews: ${reviews.length}`)
  console.log(`Total Comments: ${topLevelComments.length}`)
  console.log(`Total Replies: ${replies.length}`)
  console.log(`Action Items: ${actionItems.length}`)

  if (changesRequested.length > 0) {
    console.log(`\n🔴 ${changesRequested.length} reviewer(s) requested changes - PR cannot be merged!`)
  }

  // Create checklist file
  const checklistPath = `/tmp/pr-${pr}-checklist.md`
  const checklist = `# PR #${pr} Review Checklist

## Reviews (${reviews.length})
${reviews.map(r => `- [ ] Address ${r.user}'s ${r.state} review`).join('\n')}

## Comments (${topLevelComments.length})
${topLevelComments.map((c, i) => `- [ ] [${i+1}] ${c.user} at ${c.path}:${c.line} - "${c.body.substring(0, 50)}..."`).join('\n')}

## Action Items (${actionItems.length})
${actionItems.map(item => `- [ ] ${item}`).join('\n')}

## Final Steps
- [ ] All tests pass
- [ ] All lint issues resolved
- [ ] TypeScript has no errors
- [ ] Responded to all comments
- [ ] Updated documentation if needed
- [ ] Context folder updated
`

  require('fs').writeFileSync(checklistPath, checklist)
  console.log(`\n✅ Checklist saved to: ${checklistPath}`)
  console.log('Use this checklist to track your progress addressing feedback!')
}

main().catch(console.error)
