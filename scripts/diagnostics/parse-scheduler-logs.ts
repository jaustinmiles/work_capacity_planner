import * as fs from 'fs'
import * as readline from 'readline'

interface LogIssue {
  noPatternForOverride: string[]
  tasksOutsideBlocks: string[]
  emptyBlockAllocation: string[]
  timeConstraintViolations: string[]
  criticalErrors: string[]
  sep13Patterns: string[]
}

async function parseSchedulerLogs(logFile: string) {
  const issues: LogIssue = {
    noPatternForOverride: [],
    tasksOutsideBlocks: [],
    emptyBlockAllocation: [],
    timeConstraintViolations: [],
    criticalErrors: [],
    sep13Patterns: [],
  }

  // Check if file exists
  if (!fs.existsSync(logFile)) {
    console.error(`Log file not found: ${logFile}`)
    console.log('Available log files:')
    const files = fs.readdirSync('.').filter(f => f.includes('log'))
    files.forEach(f => console.log(`  - ${f}`))
    return
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(logFile),
    crlfDelay: Infinity,
  })

  let lineNumber = 0
  for await (const line of rl) {
    lineNumber++

    // Check for pattern loading issues
    if (line.includes('Looking for work patterns from')) {
      if (line.includes('2025-09-14') && !line.includes('2025-09-13')) {
        issues.noPatternForOverride.push(`Line ${lineNumber}: ${line}`)
      }
      if (line.includes('2025-09-13')) {
        issues.sep13Patterns.push(`Line ${lineNumber}: ${line}`)
      }
    }

    // Check for CRITICAL error about missing pattern
    if (line.includes('CRITICAL: No pattern for override date')) {
      issues.criticalErrors.push(`Line ${lineNumber}: ${line}`)
    }

    // Check for tasks scheduled outside blocks (7:05 AM is suspicious)
    if (line.includes('startTime') && (line.includes('T07:05:00') || line.includes('T14:05:00'))) {
      issues.tasksOutsideBlocks.push(`Line ${lineNumber}: ${line}`)
    }

    // Check for empty allocations
    if (line.includes('allocateToWorkBlocks result') && line.includes('"scheduled":0')) {
      issues.emptyBlockAllocation.push(`Line ${lineNumber}: ${line}`)
    }

    // Check for time constraint violations
    if (line.includes('Current time past block end') || line.includes('Start time is past block end time')) {
      issues.timeConstraintViolations.push(`Line ${lineNumber}: ${line}`)
    }

    // Check for work patterns loaded
    if (line.includes('TaskStore.loadWorkPatterns')) {
      if (line.includes('START') || line.includes('COMPLETE')) {
        console.log(`📋 Pattern Loading: Line ${lineNumber}`)
      }
    }
  }

  // Analysis Report
  console.log('\n=== Scheduler Log Analysis Report ===')
  console.log(`Analyzed: ${logFile}`)
  console.log(`Total lines: ${lineNumber}`)

  console.log('\n📊 Issue Summary:')
  console.log(`  ❌ No Sep 13 Pattern Loaded: ${issues.noPatternForOverride.length} instances`)
  console.log(`  ✅ Sep 13 Pattern References: ${issues.sep13Patterns.length} instances`)
  console.log(`  🚨 CRITICAL Errors: ${issues.criticalErrors.length} instances`)
  console.log(`  ⏰ Tasks Outside Blocks: ${issues.tasksOutsideBlocks.length} instances`)
  console.log(`  📦 Empty Block Allocations: ${issues.emptyBlockAllocation.length} instances`)
  console.log(`  ⚠️  Time Constraint Violations: ${issues.timeConstraintViolations.length} instances`)

  // Detailed samples
  if (issues.criticalErrors.length > 0) {
    console.log('\n🚨 CRITICAL ERROR Sample:')
    console.log(issues.criticalErrors[0])
  }

  if (issues.noPatternForOverride.length > 0) {
    console.log('\n❌ Pattern Loading Issue Sample:')
    console.log(issues.noPatternForOverride[0])
  }

  if (issues.tasksOutsideBlocks.length > 0) {
    console.log('\n⏰ Task Outside Block Sample:')
    console.log(issues.tasksOutsideBlocks[0])
  }

  if (issues.emptyBlockAllocation.length > 0) {
    console.log('\n📦 Empty Allocation Sample:')
    console.log(issues.emptyBlockAllocation[0])
  }

  // Success indicators
  if (issues.sep13Patterns.length > 0) {
    console.log('\n✅ Good News - Sep 13 patterns found:')
    issues.sep13Patterns.slice(0, 2).forEach(line => console.log(line))
  }

  // Recommendations
  console.log('\n💡 Recommendations:')
  if (issues.criticalErrors.length > 0) {
    console.log('  1. CRITICAL: Pattern loading is not using override date!')
    console.log('     Fix: Ensure loadWorkPatterns uses getCurrentTime()')
  }
  if (issues.tasksOutsideBlocks.length > 0) {
    console.log('  2. Tasks scheduling outside blocks suggests wrong pattern date range')
    console.log('     Fix: Verify patterns include override date')
  }
  if (issues.emptyBlockAllocation.length > 0) {
    console.log('  3. Empty allocations indicate no suitable blocks found')
    console.log('     Fix: Check that correct date patterns are loaded')
  }
}

// Get log file from command line or use default
const logFile = process.argv[2] || './logs_latest.json'
console.log(`🔍 Parsing log file: ${logFile}`)

parseSchedulerLogs(logFile).catch(console.error)
