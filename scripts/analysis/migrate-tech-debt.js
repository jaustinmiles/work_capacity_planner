#!/usr/bin/env node

/**
 * Script to migrate unresolved TECH_DEBT items to feedback.json
 * Usage: node scripts/analysis/migrate-tech-debt.js
 */

const fs = require('fs')
const path = require('path')

const FEEDBACK_FILE = path.join(__dirname, '..', '..', 'context', 'feedback.json')

// Tech debt items to migrate (from TECH_DEBT.md analysis)
const techDebtItems = [
  {
    type: 'bug',
    priority: 'medium',
    components: ['utils/scheduling'],
    title: 'Work Pattern Repetition Not Implemented',
    description: 'UI shows "daily" repetition option for work blocks but backend doesn\'t actually implement repetition. Each pattern is saved only for the specific date with no logic to apply patterns to future dates. Need to implement repetition logic in database layer, add recurring pattern support (daily, weekly, etc.), and update UI to properly reflect repetition status.',
    source: 'TECH_DEBT.md',
  },
  {
    type: 'improvement',
    priority: 'high',
    components: ['config/eslint'],
    title: 'ESLint Configuration Too Permissive',
    description: 'Current ESLint config doesn\'t catch potentially undefined values. No strict null checking rules enabled. TypeScript @typescript-eslint/recommended preset too lenient. This leads to bugs like sortedItems[0] access without safety checks. Need to enable strict-boolean-expressions and no-unsafe-member-access, then fix all resulting errors (likely 100+ locations).',
    source: 'TECH_DEBT.md',
  },
  {
    type: 'improvement',
    priority: 'critical',
    components: ['database', 'tasks/TaskList', 'tasks/SequencedTaskEdit'],
    title: 'Workflow/Task Model Confusion',
    description: 'Workflows stored as Tasks with hasSteps=true causing type confusion throughout codebase. Priority calculation creates fake Task objects from TaskSteps. Duplicate logic for handling tasks vs workflow steps. Constant type casting required. See context/architecture-improvements.md for proposed fix.',
    source: 'TECH_DEBT.md',
  },
  {
    type: 'bug',
    priority: 'high',
    components: ['dev/LogViewer'],
    title: 'LogViewer Database Integration Missing',
    description: 'Cannot view historical logs from previous sessions. IPC handler for get-session-logs not implemented. Database query methods for ErrorLog table needed. Session selector UI disabled but ready. This blocks debugging of past issues. Need to add database methods to fetch ErrorLog entries by session and implement IPC handler in main process.',
    source: 'TECH_DEBT.md',
  },
  {
    type: 'improvement',
    priority: 'high',
    components: ['utils/scheduling', 'tests'],
    title: 'Scheduling Test Suite Rewrite Needed',
    description: 'Tests written for old deadline-scheduler don\'t match new SchedulingEngine behavior. Entire deadline-scheduling.test.ts suite skipped. One test in dependency-scheduling.test.ts skipped. Need to write new test suite for unified SchedulingEngine testing deadline pressure, async urgency, and priority calculations in context.',
    source: 'TECH_DEBT.md',
  },
  {
    type: 'bug',
    priority: 'high',
    components: ['voice/VoiceAmendmentModal', 'utils/amendment-applicator'],
    title: 'AI Amendment Dependency Editing Not Working',
    description: 'Dependency changes via voice commands fail. Issue discovered during beta test. Need to debug amendment-applicator.ts dependency logic. Voice amendments for dependencies not functional.',
    source: 'TECH_DEBT.md',
  },
  {
    type: 'improvement',
    priority: 'medium',
    components: ['scripts'],
    title: 'Script Directory Organization Issues',
    description: '1386+ ESLint warnings from scripts using console.log extensively. Consider unified CLI tool instead of 30+ individual scripts. Missing TypeScript types in some scripts. Duplicate functionality across scripts. Need to create unified CLI with subcommands and add proper .eslintrc for scripts directory.',
    source: 'TECH_DEBT.md',
  },
  {
    type: 'improvement',
    priority: 'medium',
    components: ['logging'],
    title: 'Console Logging Cleanup Needed',
    description: 'Excessive logging in database operations (DB: logs everywhere), amendment parsing flow, and voice modal debugging. Noisy console output affecting development. Need to add debug flag or remove before production.',
    source: 'TECH_DEBT.md',
  },
  {
    type: 'improvement',
    priority: 'medium',
    components: ['tests', 'voice/VoiceAmendmentModal'],
    title: 'Test Coverage for Voice Features',
    description: 'Missing tests for voice amendment integration, workflow step addition, IPC enum serialization, and job context integration. Reduced confidence in voice features. Need comprehensive test suite for new functionality.',
    source: 'TECH_DEBT.md',
  },
  {
    type: 'improvement',
    priority: 'medium',
    components: ['tasks/SequencedTaskEdit', 'ui'],
    title: 'Workflow UI Polish Needed',
    description: 'Graph view could be more interactive. Step completion UI needs better feedback. Dependency visualization could be clearer. Overall UX improvements needed for workflow management.',
    source: 'TECH_DEBT.md',
  },
  {
    type: 'improvement',
    priority: 'low',
    components: ['docs'],
    title: 'Documentation Updates Needed',
    description: 'Architecture diagram still shows old dual model. API documentation for new voice features missing. Testing guide for voice amendments needed. Various documentation files need updates to reflect current state.',
    source: 'TECH_DEBT.md',
  },
  {
    type: 'improvement',
    priority: 'low',
    components: ['performance'],
    title: 'Performance Optimizations Needed',
    description: 'Database queries could be optimized. UI re-renders on amendment application. Voice recording file cleanup needed. Performance issues with large workflow handling.',
    source: 'TECH_DEBT.md',
  },
]

function loadFeedback() {
  try {
    const data = fs.readFileSync(FEEDBACK_FILE, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error loading feedback.json:', error.message)
    process.exit(1)
  }
}

function saveFeedback(feedback) {
  try {
    const data = JSON.stringify(feedback, null, 2)
    fs.writeFileSync(FEEDBACK_FILE, data, 'utf8')
    console.log(`✅ Saved ${feedback.length} items to feedback.json`)
  } catch (error) {
    console.error('Error saving feedback.json:', error.message)
    process.exit(1)
  }
}

function main() {
  console.log('📋 Loading existing feedback...')
  const feedback = loadFeedback()
  console.log(`  Found ${feedback.length} existing items`)

  // Check for duplicates (by title)
  const existingTitles = new Set(feedback.map(item => item.title))

  let addedCount = 0
  const baseTimestamp = new Date()

  techDebtItems.forEach((item, index) => {
    if (existingTitles.has(item.title)) {
      console.log(`  ⏭️  Skipping duplicate: ${item.title}`)
    } else {
      // Add unique timestamp for each item (increment by 100ms to ensure uniqueness)
      const itemTimestamp = new Date(baseTimestamp.getTime() + (index * 100))
      feedback.push({
        ...item,
        timestamp: itemTimestamp.toISOString(),
        sessionId: 'tech-debt-migration-2025-09-04',
      })
      addedCount++
      console.log(`  ✅ Added: [${item.priority}] ${item.title}`)
    }
  })

  if (addedCount > 0) {
    console.log(`\n📝 Adding ${addedCount} new items from TECH_DEBT.md...`)
    saveFeedback(feedback)
    console.log(`\n✨ Migration complete! Total items now: ${feedback.length}`)
  } else {
    console.log('\n✨ No new items to add - all tech debt items already exist in feedback.json')
  }

  // Show summary
  const unresolved = feedback.filter(item => !item.resolved)
  const byPriority = {
    critical: unresolved.filter(item => item.priority === 'critical').length,
    high: unresolved.filter(item => item.priority === 'high').length,
    medium: unresolved.filter(item => item.priority === 'medium').length,
    low: unresolved.filter(item => item.priority === 'low').length,
  }

  console.log('\n📊 Updated Summary:')
  console.log(`  Total unresolved: ${unresolved.length}`)
  console.log(`  Critical: ${byPriority.critical}`)
  console.log(`  High: ${byPriority.high}`)
  console.log(`  Medium: ${byPriority.medium}`)
  console.log(`  Low: ${byPriority.low}`)
}

main()
