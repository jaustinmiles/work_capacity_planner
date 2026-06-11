#!/usr/bin/env node

/**
 * Utility script for managing feedback items.
 *
 * Feedback lives in the Prisma `Feedback` table (the central store shared by
 * every client and the tRPC feedback router). The legacy context/feedback.json
 * file is a read-only archive; use `import-json` to migrate it into the table.
 *
 * Usage:
 *   node scripts/analysis/feedback-utils.js [command] [options]
 *
 * Commands:
 *   unresolved - Show all unresolved feedback items
 *   summary - Show summary of feedback by status
 *   high - Show high priority unresolved items
 *   by-type [type] - Show unresolved items of specific type
 *     Types: bug, feature, improvement, technical_debt, enhancement, refactoring, other
 *   resolve [title] - Mark item(s) as resolved by title substring match
 *   add [type] [priority] [title] [description] - Add a new feedback item
 *   import-json - One-time idempotent import of context/feedback.json into the table
 */

const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const LEGACY_FEEDBACK_FILE = path.join(__dirname, '..', '..', 'context', 'feedback.json')

const prisma = new PrismaClient()

// Color codes for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
}

function getPriorityColor(priority) {
  switch (priority) {
    case 'critical': return colors.red
    case 'high': return colors.yellow
    case 'medium': return colors.cyan
    case 'low': return colors.green
    default: return colors.reset
  }
}

function getTypeColor(type) {
  switch (type) {
    case 'bug': return colors.red
    case 'feature': return colors.blue
    case 'improvement': return colors.cyan
    case 'technical_debt': return colors.magenta
    case 'enhancement': return colors.green
    case 'refactoring': return colors.yellow
    default: return colors.reset
  }
}

function parseComponents(components) {
  if (!components) return []
  try {
    const parsed = JSON.parse(components)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatFeedbackItem(item, index) {
  const priorityColor = getPriorityColor(item.priority)
  const typeColor = getTypeColor(item.type)

  console.log(`\n${colors.bold}#${index + 1}${colors.reset} ${typeColor}[${item.type.toUpperCase()}]${colors.reset} ${priorityColor}(${item.priority})${colors.reset}`)
  console.log(`  ${colors.bold}Title:${colors.reset} ${item.title}`)
  console.log(`  ${colors.bold}Description:${colors.reset} ${item.description}`)
  const components = parseComponents(item.components)
  if (components.length > 0) {
    console.log(`  ${colors.bold}Components:${colors.reset} ${components.join(', ')}`)
  }
  if (item.createdAt) {
    const date = new Date(item.createdAt)
    console.log(`  ${colors.bold}Date:${colors.reset} ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`)
  }
}

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

function sortByPriorityThenType(items) {
  return [...items].sort((a, b) => {
    const priorityDiff = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
    if (priorityDiff !== 0) return priorityDiff
    return a.type.localeCompare(b.type)
  })
}

async function showUnresolved() {
  const unresolved = await prisma.feedback.findMany({ where: { resolved: false } })

  if (unresolved.length === 0) {
    console.log(`${colors.green}✓ All feedback items are resolved!${colors.reset}`)
    return
  }

  console.log(`${colors.bold}Found ${unresolved.length} unresolved feedback items:${colors.reset}`)
  sortByPriorityThenType(unresolved).forEach((item, index) => formatFeedbackItem(item, index))

  // Summary
  console.log(`\n${colors.bold}Summary:${colors.reset}`)
  const byType = {}
  const byPriority = {}

  unresolved.forEach(item => {
    byType[item.type] = (byType[item.type] || 0) + 1
    byPriority[item.priority] = (byPriority[item.priority] || 0) + 1
  })

  console.log('  By Type:')
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`    ${getTypeColor(type)}${type}${colors.reset}: ${count}`)
  })

  console.log('  By Priority:')
  Object.entries(byPriority).forEach(([priority, count]) => {
    console.log(`    ${getPriorityColor(priority)}${priority}${colors.reset}: ${count}`)
  })
}

async function showSummary() {
  const [total, resolved] = await Promise.all([
    prisma.feedback.count(),
    prisma.feedback.count({ where: { resolved: true } }),
  ])
  const unresolvedCount = total - resolved

  console.log(`${colors.bold}Feedback Summary:${colors.reset}`)
  console.log(`  Total items: ${total}`)
  console.log(`  ${colors.green}Resolved: ${resolved}${colors.reset}`)
  console.log(`  ${colors.yellow}Unresolved: ${unresolvedCount}${colors.reset}`)

  if (unresolvedCount > 0) {
    const counts = await prisma.feedback.groupBy({
      by: ['priority'],
      where: { resolved: false },
      _count: { _all: true },
    })
    const byPriority = Object.fromEntries(counts.map(row => [row.priority, row._count._all]))

    console.log(`\n${colors.bold}Unresolved by Priority:${colors.reset}`)
    if (byPriority.critical) console.log(`  ${colors.red}Critical: ${byPriority.critical}${colors.reset}`)
    if (byPriority.high) console.log(`  ${colors.yellow}High: ${byPriority.high}${colors.reset}`)
    if (byPriority.medium) console.log(`  ${colors.cyan}Medium: ${byPriority.medium}${colors.reset}`)
    if (byPriority.low) console.log(`  ${colors.green}Low: ${byPriority.low}${colors.reset}`)
  }
}

async function showHighPriority() {
  const highPriority = await prisma.feedback.findMany({
    where: { resolved: false, priority: { in: ['critical', 'high'] } },
  })

  if (highPriority.length === 0) {
    console.log(`${colors.green}✓ No high priority unresolved items!${colors.reset}`)
    return
  }

  console.log(`${colors.bold}Found ${highPriority.length} high priority unresolved items:${colors.reset}`)
  sortByPriorityThenType(highPriority).forEach((item, index) => formatFeedbackItem(item, index))
}

async function showByType(type) {
  const filtered = await prisma.feedback.findMany({ where: { resolved: false, type } })

  if (filtered.length === 0) {
    console.log(`${colors.green}✓ No unresolved ${type} items!${colors.reset}`)
    return
  }

  console.log(`${colors.bold}Found ${filtered.length} unresolved ${type} items:${colors.reset}`)
  filtered.forEach((item, index) => formatFeedbackItem(item, index))
}

async function resolveFeedback(titleSearch) {
  const matches = await prisma.feedback.findMany({
    where: { resolved: false, title: { contains: titleSearch, mode: 'insensitive' } },
  })

  if (matches.length === 0) {
    console.log(`${colors.yellow}No unresolved items matching "${titleSearch}" found.${colors.reset}`)
    return
  }

  const now = new Date()
  await prisma.feedback.updateMany({
    where: { id: { in: matches.map(item => item.id) } },
    data: { resolved: true, resolvedDate: now },
  })

  matches.forEach(item => {
    console.log(`${colors.green}✓ Resolved:${colors.reset} ${item.title}`)
  })
  console.log(`\n${colors.bold}Resolved ${matches.length} item(s).${colors.reset}`)
}

const VALID_TYPES = ['bug', 'feature', 'improvement', 'technical_debt', 'enhancement', 'refactoring', 'other']
const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low']

async function addFeedback(type, priority, title, description) {
  if (!VALID_TYPES.includes(type)) {
    console.error(`Invalid type: ${type}. Valid types: ${VALID_TYPES.join(', ')}`)
    process.exit(1)
  }
  if (!VALID_PRIORITIES.includes(priority)) {
    console.error(`Invalid priority: ${priority}. Valid priorities: ${VALID_PRIORITIES.join(', ')}`)
    process.exit(1)
  }

  await prisma.feedback.create({
    data: {
      type,
      priority,
      title,
      description,
      components: null,
      sessionId: 'cli-feedback-utils',
    },
  })
  console.log(`${colors.green}✓ Added new ${type} feedback:${colors.reset} ${title}`)
}

/**
 * One-time idempotent import of the legacy context/feedback.json archive into
 * the Feedback table. Identity key: (title, sessionId, createdAt) — re-running
 * skips rows that already exist.
 */
async function importLegacyJson() {
  let raw
  try {
    raw = fs.readFileSync(LEGACY_FEEDBACK_FILE, 'utf8')
  } catch (error) {
    console.error(`Cannot read ${LEGACY_FEEDBACK_FILE}: ${error.message}`)
    process.exit(1)
  }

  const items = JSON.parse(raw)
  if (!Array.isArray(items)) {
    console.error('feedback.json is not an array — aborting')
    process.exit(1)
  }

  let imported = 0
  let skipped = 0
  for (const item of items) {
    if (!item || typeof item.title !== 'string') {
      skipped++
      continue
    }
    const createdAt = item.timestamp ? new Date(item.timestamp) : new Date()
    const sessionId = typeof item.sessionId === 'string' ? item.sessionId : 'unknown'

    const existing = await prisma.feedback.findFirst({
      where: { title: item.title, sessionId, createdAt },
      select: { id: true },
    })
    if (existing) {
      skipped++
      continue
    }

    await prisma.feedback.create({
      data: {
        type: VALID_TYPES.includes(item.type) ? item.type : 'other',
        priority: VALID_PRIORITIES.includes(item.priority) ? item.priority : 'medium',
        title: item.title,
        description: typeof item.description === 'string' ? item.description : '',
        components: Array.isArray(item.components) && item.components.length > 0
          ? JSON.stringify(item.components)
          : null,
        steps: typeof item.steps === 'string' ? item.steps : null,
        expected: typeof item.expected === 'string' ? item.expected : null,
        actual: typeof item.actual === 'string' ? item.actual : null,
        sessionId,
        createdAt,
        resolved: Boolean(item.resolved),
        resolvedDate: item.resolvedDate ? new Date(item.resolvedDate) : null,
        resolvedIn: typeof item.resolvedIn === 'string' ? item.resolvedIn : null,
      },
    })
    imported++
  }

  console.log(`${colors.green}✓ Import complete:${colors.reset} ${imported} imported, ${skipped} skipped (already present or invalid)`)
}

function showHelp() {
  console.log(`${colors.bold}Feedback Utility Script${colors.reset}`)
  console.log('\nUsage: node scripts/analysis/feedback-utils.js [command] [options]\n')
  console.log('Commands:')
  console.log('  unresolved          - Show all unresolved feedback items (default)')
  console.log('  summary             - Show summary of feedback by status')
  console.log('  high                - Show high/critical priority unresolved items')
  console.log('  by-type TYPE        - Show unresolved items of specific type')
  console.log(`                        Types: ${VALID_TYPES.join(', ')}`)
  console.log('  resolve TITLE       - Mark items as resolved by title substring match')
  console.log('  add TYPE PRI TITLE DESC - Add a new feedback item')
  console.log('  import-json         - Import the legacy context/feedback.json archive (idempotent)')
  console.log('  help                - Show this help message')
}

async function main() {
  const command = process.argv[2] || 'unresolved'
  const arg = process.argv[3]

  switch (command) {
    case 'unresolved':
      await showUnresolved()
      break
    case 'summary':
      await showSummary()
      break
    case 'high':
      await showHighPriority()
      break
    case 'by-type':
      if (!arg) {
        console.error(`Please specify a type: ${VALID_TYPES.join(', ')}`)
        process.exit(1)
      }
      await showByType(arg)
      break
    case 'resolve':
      if (!arg) {
        console.error('Please specify a title substring to match')
        process.exit(1)
      }
      await resolveFeedback(process.argv.slice(3).join(' '))
      break
    case 'add': {
      const addType = process.argv[3]
      const addPriority = process.argv[4]
      const addTitle = process.argv[5]
      const addDescription = process.argv.slice(6).join(' ')
      if (!addType || !addPriority || !addTitle || !addDescription) {
        console.error('Usage: add TYPE PRIORITY TITLE DESCRIPTION')
        process.exit(1)
      }
      await addFeedback(addType, addPriority, addTitle, addDescription)
      break
    }
    case 'import-json':
      await importLegacyJson()
      break
    case 'help':
    case '--help':
    case '-h':
      showHelp()
      break
    default:
      console.error(`Unknown command: ${command}`)
      showHelp()
      process.exit(1)
  }
}

main()
  .catch(error => {
    console.error(`Feedback command failed: ${error.message}`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
