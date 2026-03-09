#!/usr/bin/env node

/**
 * Utility script for managing feedback items
 * Usage:
 *   node scripts/feedback-utils.js [command] [options]
 *
 * Commands:
 *   unresolved - Show all unresolved feedback items
 *   summary - Show summary of feedback by status
 *   high - Show high priority unresolved items
 *   by-type [type] - Show unresolved items of specific type
 *     Types: bug, feature, improvement, technical_debt, enhancement, refactoring, other
 *   resolve [title] - Mark item(s) as resolved by title substring match
 *   add [type] [priority] [title] [description] - Add a new feedback item
 */

const fs = require('fs')
const path = require('path')

const FEEDBACK_FILE = path.join(__dirname, '..', '..', 'context', 'feedback.json')

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

function loadFeedback() {
  try {
    const data = fs.readFileSync(FEEDBACK_FILE, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error loading feedback.json:', error.message)
    process.exit(1)
  }
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

function formatFeedbackItem(item, index) {
  const priorityColor = getPriorityColor(item.priority)
  const typeColor = getTypeColor(item.type)

  console.log(`\n${colors.bold}#${index + 1}${colors.reset} ${typeColor}[${item.type.toUpperCase()}]${colors.reset} ${priorityColor}(${item.priority})${colors.reset}`)
  console.log(`  ${colors.bold}Title:${colors.reset} ${item.title}`)
  console.log(`  ${colors.bold}Description:${colors.reset} ${item.description}`)
  if (item.components && item.components.length > 0) {
    console.log(`  ${colors.bold}Components:${colors.reset} ${item.components.join(', ')}`)
  }
  if (item.timestamp) {
    const date = new Date(item.timestamp)
    console.log(`  ${colors.bold}Date:${colors.reset} ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`)
  }
}

function showUnresolved() {
  const feedback = loadFeedback()
  const unresolved = feedback.filter(item => !item.resolved)

  if (unresolved.length === 0) {
    console.log(`${colors.green}✓ All feedback items are resolved!${colors.reset}`)
    return
  }

  console.log(`${colors.bold}Found ${unresolved.length} unresolved feedback items:${colors.reset}`)

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  unresolved.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    // Then by type
    return a.type.localeCompare(b.type)
  })

  unresolved.forEach((item, index) => formatFeedbackItem(item, index))

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

function showSummary() {
  const feedback = loadFeedback()
  const resolved = feedback.filter(item => item.resolved)
  const unresolved = feedback.filter(item => !item.resolved)

  console.log(`${colors.bold}Feedback Summary:${colors.reset}`)
  console.log(`  Total items: ${feedback.length}`)
  console.log(`  ${colors.green}Resolved: ${resolved.length}${colors.reset}`)
  console.log(`  ${colors.yellow}Unresolved: ${unresolved.length}${colors.reset}`)

  if (unresolved.length > 0) {
    console.log(`\n${colors.bold}Unresolved by Priority:${colors.reset}`)
    const critical = unresolved.filter(i => i.priority === 'critical')
    const high = unresolved.filter(i => i.priority === 'high')
    const medium = unresolved.filter(i => i.priority === 'medium')
    const low = unresolved.filter(i => i.priority === 'low')

    if (critical.length > 0) console.log(`  ${colors.red}Critical: ${critical.length}${colors.reset}`)
    if (high.length > 0) console.log(`  ${colors.yellow}High: ${high.length}${colors.reset}`)
    if (medium.length > 0) console.log(`  ${colors.cyan}Medium: ${medium.length}${colors.reset}`)
    if (low.length > 0) console.log(`  ${colors.green}Low: ${low.length}${colors.reset}`)
  }
}

function showHighPriority() {
  const feedback = loadFeedback()
  const highPriority = feedback.filter(item =>
    !item.resolved && (item.priority === 'critical' || item.priority === 'high'),
  )

  if (highPriority.length === 0) {
    console.log(`${colors.green}✓ No high priority unresolved items!${colors.reset}`)
    return
  }

  console.log(`${colors.bold}Found ${highPriority.length} high priority unresolved items:${colors.reset}`)
  highPriority.forEach((item, index) => formatFeedbackItem(item, index))
}

function showByType(type) {
  const feedback = loadFeedback()
  const filtered = feedback.filter(item =>
    !item.resolved && item.type === type,
  )

  if (filtered.length === 0) {
    console.log(`${colors.green}✓ No unresolved ${type} items!${colors.reset}`)
    return
  }

  console.log(`${colors.bold}Found ${filtered.length} unresolved ${type} items:${colors.reset}`)
  filtered.forEach((item, index) => formatFeedbackItem(item, index))
}

function resolveFeedback(titleSearch) {
  const feedback = loadFeedback()
  const searchLower = titleSearch.toLowerCase()
  let resolvedCount = 0

  feedback.forEach(item => {
    if (!item.resolved && item.title.toLowerCase().includes(searchLower)) {
      item.resolved = true
      item.resolvedDate = new Date().toISOString()
      resolvedCount++
      console.log(`${colors.green}✓ Resolved:${colors.reset} ${item.title}`)
    }
  })

  if (resolvedCount === 0) {
    console.log(`${colors.yellow}No unresolved items matching "${titleSearch}" found.${colors.reset}`)
    return
  }

  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedback, null, 2))
  console.log(`\n${colors.bold}Resolved ${resolvedCount} item(s).${colors.reset}`)
}

const VALID_TYPES = ['bug', 'feature', 'improvement', 'technical_debt', 'enhancement', 'refactoring', 'other']
const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low']

function addFeedback(type, priority, title, description) {
  if (!VALID_TYPES.includes(type)) {
    console.error(`Invalid type: ${type}. Valid types: ${VALID_TYPES.join(', ')}`)
    process.exit(1)
  }
  if (!VALID_PRIORITIES.includes(priority)) {
    console.error(`Invalid priority: ${priority}. Valid priorities: ${VALID_PRIORITIES.join(', ')}`)
    process.exit(1)
  }

  const feedback = loadFeedback()
  const newItem = {
    type,
    priority,
    title,
    description,
    components: [],
    timestamp: new Date().toISOString(),
    sessionId: 'cli-feedback-utils',
    resolved: false,
  }

  feedback.push(newItem)
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedback, null, 2))
  console.log(`${colors.green}✓ Added new ${type} feedback:${colors.reset} ${title}`)
}

function showHelp() {
  console.log(`${colors.bold}Feedback Utility Script${colors.reset}`)
  console.log('\nUsage: node scripts/feedback-utils.js [command] [options]\n')
  console.log('Commands:')
  console.log('  unresolved          - Show all unresolved feedback items (default)')
  console.log('  summary             - Show summary of feedback by status')
  console.log('  high                - Show high/critical priority unresolved items')
  console.log('  by-type TYPE        - Show unresolved items of specific type')
  console.log(`                        Types: ${VALID_TYPES.join(', ')}`)
  console.log('  resolve TITLE       - Mark items as resolved by title substring match')
  console.log('  add TYPE PRI TITLE DESC - Add a new feedback item')
  console.log('  help                - Show this help message')
}

// Main execution
const command = process.argv[2] || 'unresolved'
const arg = process.argv[3]

switch (command) {
  case 'unresolved':
    showUnresolved()
    break
  case 'summary':
    showSummary()
    break
  case 'high':
    showHighPriority()
    break
  case 'by-type':
    if (!arg) {
      console.error(`Please specify a type: ${VALID_TYPES.join(', ')}`)
      process.exit(1)
    }
    showByType(arg)
    break
  case 'resolve':
    if (!arg) {
      console.error('Please specify a title substring to match')
      process.exit(1)
    }
    resolveFeedback(process.argv.slice(3).join(' '))
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
    addFeedback(addType, addPriority, addTitle, addDescription)
    break
  }
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
