#!/usr/bin/env npx tsx
import { execSync } from 'child_process'

interface Review {
  id: number
  user: string
  body: string
  state: string
  submitted_at: string
  html_url: string
  isMinimized?: boolean
  minimizedReason?: string
}

interface _ReviewComment {
  id: number
  path: string
  line?: number
  body: string
  user: string
  created_at: string
  html_url: string
  in_reply_to_id?: number
  position?: number
}

interface ReviewThread {
  id: string
  isResolved: boolean
  isOutdated: boolean
  isCollapsed: boolean
  path: string
  line: number
  comments: Array<{
    id: string
    body: string
    author: {
      login: string
    }
    createdAt: string
  }>
}

function runCommand(command: string): string {
  try {
    return execSync(command, { encoding: 'utf8' })
  } catch (error: any) {
    if (error.stdout) {
      return error.stdout.toString()
    }
    throw error
  }
}

function formatReview(review: Review, maxLength: number = 500): string {
  const stateEmoji = {
    'APPROVED': '✅',
    'CHANGES_REQUESTED': '🔴',
    'COMMENTED': '💬',
    'PENDING': '⏳',
    'DISMISSED': '❌',
  }[review.state] || '❓'

  let body = review.body || '(No review body)'

  // Truncate very long review bodies (like CI logs)
  if (body.length > maxLength) {
    const lines = body.split('\n')
    if (lines.length > 10) {
      // If it's many lines, show first 5 and last 2
      body = [...lines.slice(0, 5), `\n... (${lines.length - 7} lines truncated) ...\n`, ...lines.slice(-2)].join('\n')
    } else {
      // Otherwise just truncate
      body = body.substring(0, maxLength) + `\n... (${body.length - maxLength} more characters)`
    }
  }

  return `
${stateEmoji} REVIEW by ${review.user} - ${review.state}
════════════════════════════════════════════════
${body}
URL: ${review.html_url}
Submitted: ${new Date(review.submitted_at).toLocaleString()}
════════════════════════════════════════════════`
}

function formatThread(thread: ReviewThread): string {
  if (!thread.comments || thread.comments.length === 0) {
    return `
📍 ${thread.path}:${thread.line} [Empty thread]
────────────────────────────────────────────
(No comments in this thread)
────────────────────────────────────────────`
  }

  const firstComment = thread.comments[0]
  const statusIcons = []
  if (thread.isResolved) statusIcons.push('✓')
  if (thread.isOutdated) statusIcons.push('⚠')
  if (thread.isCollapsed) statusIcons.push('▼')
  const status = statusIcons.length > 0 ? ` [${statusIcons.join('')}]` : ''

  return `
📍 ${thread.path}:${thread.line}${status}
────────────────────────────────────────────
${firstComment.author.login}: ${firstComment.body}
${thread.comments.length > 1 ? `(+${thread.comments.length - 1} replies)` : ''}
Created: ${new Date(firstComment.createdAt).toLocaleString()}
────────────────────────────────────────────`
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const prNumber = args.find(arg => !arg.startsWith('--'))
  const showResolved = args.includes('--show-resolved')
  const showAll = args.includes('--all')
  const showReviews = !args.includes('--no-reviews')
  const verbose = args.includes('--verbose')

  if (!prNumber) {
    // Try to get PR number from current branch
    const prListJson = runCommand('gh pr list --head $(git branch --show-current) --json number --limit 1')
    const prList = JSON.parse(prListJson || '[]')
    if (prList.length === 0) {
      console.error('No PR number provided and no PR found for current branch')
      console.error('Usage: npx tsx scripts/pr/pr-review-tracker.ts [pr-number] [options]')
      console.error('Options:')
      console.error('  --show-resolved   Include resolved comments')
      console.error('  --all             Show all comments including resolved and collapsed')
      console.error('  --no-reviews      Hide review summaries (only show inline comments)')
      console.error('  --verbose         Show full review bodies without truncation')
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

  // Get all reviews using GraphQL to check for hidden/minimized status
  if (showReviews) {
    console.log('📝 REVIEWS')
    console.log('───────────────────────────────────────────────────────────')

    // Use GraphQL to get reviews with minimized status
    const reviewQuery = `
      query($owner: String!, $repo: String!, $pr: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $pr) {
            reviews(first: 100) {
              nodes {
                id
                state
                body
                isMinimized
                minimizedReason
                author {
                  login
                }
                submittedAt
                url
              }
            }
          }
        }
      }
    `

    const { owner, name } = JSON.parse(runCommand('gh repo view --json owner,name'))
    const reviewResult = runCommand(
      `gh api graphql -f query='${reviewQuery}' -F owner="${owner.login}" -F repo="${name}" -F pr=${pr}`,
    )

    const reviewData = JSON.parse(reviewResult)
    const reviews: Review[] = reviewData.data.repository.pullRequest.reviews.nodes.map((r: any) => ({
      id: r.id,
      user: r.author.login,
      body: r.body,
      state: r.state,
      submitted_at: r.submittedAt,
      html_url: r.url,
      isMinimized: r.isMinimized,
      minimizedReason: r.minimizedReason,
    }))

    // Filter out bot reviews that are just empty comments and hidden reviews
    const visibleReviews = reviews.filter(r => {
      // Always hide minimized/hidden reviews unless verbose mode
      if (r.isMinimized && !verbose) return false
      // Hide empty bot comments
      if (r.state === 'COMMENTED' && !r.body?.trim()) return false
      return true
    })

    if (visibleReviews.length === 0) {
      console.log('No reviews to show')
      const hiddenCount = reviews.filter(r => r.isMinimized).length
      if (hiddenCount > 0) {
        console.log(`(${hiddenCount} review(s) hidden - use --verbose to see them)`)
      }
    } else {
      const maxLength = verbose ? Infinity : 500
      visibleReviews.forEach(review => {
        if (review.isMinimized) {
          console.log('\n⚠️  HIDDEN REVIEW (showing because --verbose was used)')
        }
        console.log(formatReview(review, maxLength))
      })
    }
  }

  // Get review threads with resolved status using GraphQL
  console.log('\n💬 INLINE COMMENTS')
  console.log('───────────────────────────────────────────────────────────')

  // Get repository owner and name
  const repoInfo = runCommand('gh repo view --json owner,name')
  const { owner, name } = JSON.parse(repoInfo)

  // Use GraphQL to get review threads with resolved status
  const graphqlQuery = `
    query($owner: String!, $repo: String!, $pr: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pr) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              isOutdated
              isCollapsed
              path
              line
              comments(first: 10) {
                nodes {
                  id
                  body
                  author {
                    login
                  }
                  createdAt
                }
              }
            }
          }
        }
      }
    }
  `

  const graphqlResult = runCommand(
    `gh api graphql -f query='${graphqlQuery}' -F owner="${owner.login}" -F repo="${name}" -F pr=${pr}`,
  )

  const graphqlData = JSON.parse(graphqlResult)
  const allThreads: ReviewThread[] = graphqlData.data.repository.pullRequest.reviewThreads.nodes

  // Filter out threads without comments
  const threads = allThreads.filter(t => t.comments && t.comments.length > 0)

  // Filter threads based on flags
  let filteredThreads = threads

  if (!showAll) {
    // By default, hide resolved and collapsed comments
    filteredThreads = threads.filter(t => !t.isResolved || showResolved)

    if (!showResolved) {
      // Also filter out collapsed threads unless explicitly showing resolved
      filteredThreads = filteredThreads.filter(t => !t.isCollapsed)
    }
  }

  // Count statistics
  const stats = {
    total: threads.length,
    unresolved: threads.filter(t => !t.isResolved).length,
    resolved: threads.filter(t => t.isResolved).length,
    outdated: threads.filter(t => t.isOutdated).length,
    collapsed: threads.filter(t => t.isCollapsed).length,
  }

  // Show statistics
  console.log('📊 STATISTICS')
  console.log(`Total: ${stats.total} | Unresolved: ${stats.unresolved} | Resolved: ${stats.resolved}`)
  console.log(`Outdated: ${stats.outdated} | Collapsed: ${stats.collapsed}`)

  if (!showAll && stats.resolved > 0) {
    console.log(`\n💡 Hiding ${stats.resolved} resolved comments (use --show-resolved or --all to see them)`)
  }

  console.log('\n📌 ACTIVE COMMENTS')
  console.log('───────────────────────────────────────────────────────────')

  if (filteredThreads.length === 0) {
    console.log('No active comments to address! 🎉')
  } else {
    filteredThreads.forEach((thread) => {
      console.log(formatThread(thread))
    })
  }

  // Summary
  console.log('\n📋 SUMMARY')
  console.log('───────────────────────────────────────────────────────────')

  const hasUnresolved = stats.unresolved > 0

  // Check for changes requested in reviews if we have them
  let hasChangesRequested = false
  if (showReviews) {
    // Need to re-fetch reviews for summary if they weren't already fetched
    const { owner, name } = JSON.parse(runCommand('gh repo view --json owner,name'))
    const summaryReviewsJson = runCommand(`gh api repos/${owner.login}/${name}/pulls/${pr}/reviews --jq '[.[] | select(.state == "CHANGES_REQUESTED")]'`)
    const changesRequestedReviews = JSON.parse(summaryReviewsJson || '[]')
    hasChangesRequested = changesRequestedReviews.length > 0
  }

  if (!hasUnresolved && !hasChangesRequested) {
    console.log('✅ All feedback has been addressed!')
  } else {
    if (hasChangesRequested) {
      console.log('⚠️  Changes requested by reviewer(s)')
    }
    if (hasUnresolved) {
      console.log(`⚠️  ${stats.unresolved} comment(s) still need to be resolved`)
    }
  }
}

main().catch(console.error)

