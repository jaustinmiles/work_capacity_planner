#!/usr/bin/env npx tsx

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

function exec(command: string): string {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe' })
  } catch (error: any) {
    console.error(`Command failed: ${command}`)
    console.error(error.message)
    process.exit(1)
  }
}

function getLatestRunForPR(prNumber: string): string | null {
  try {
    const runs = exec(`gh pr view ${prNumber} --json statusCheckRollup --jq '.statusCheckRollup[] | select(.workflowName == "CI") | .targetUrl'`)
    const runUrl = runs.trim().split('\n')[0]
    
    if (runUrl) {
      // Extract run ID from URL like https://github.com/owner/repo/actions/runs/12345
      const match = runUrl.match(/\/runs\/(\d+)/)
      return match ? match[1] : null
    }
    
    // Fallback: get the latest run for the PR branch
    const branch = exec(`gh pr view ${prNumber} --json headRefName --jq '.headRefName'`).trim()
    const latestRun = exec(`gh run list --branch ${branch} --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId'`).trim()
    return latestRun || null
  } catch {
    return null
  }
}

function downloadPlaywrightReport(runId: string): boolean {
  const reportDir = path.join(process.cwd(), 'playwright-report-from-ci')
  
  // Remove old report if exists
  if (fs.existsSync(reportDir)) {
    console.log('Removing old report...')
    fs.rmSync(reportDir, { recursive: true, force: true })
  }
  
  console.log(`Downloading Playwright report from run ${runId}...`)
  
  try {
    exec(`gh run download ${runId} --name playwright-report --dir ${reportDir}`)
    console.log('✓ Report downloaded successfully')
    return true
  } catch (error) {
    console.error('Failed to download report. The run might not have a playwright-report artifact.')
    return false
  }
}

function openReport(): void {
  const reportDir = path.join(process.cwd(), 'playwright-report-from-ci')
  
  if (!fs.existsSync(reportDir)) {
    console.error('No report found. Please download it first.')
    process.exit(1)
  }
  
  console.log('Opening Playwright report in browser...')
  console.log('Press Ctrl+C to stop the server')
  
  // Use execSync with stdio: 'inherit' to keep the server running
  execSync('npx playwright show-report', {
    stdio: 'inherit',
    cwd: reportDir
  })
}

function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.log(`
Usage: npx tsx scripts/pr/pr-playwright-report.ts <pr-number|run-id> [--open-only]

Examples:
  npx tsx scripts/pr/pr-playwright-report.ts 55              # Download and open report from PR #55
  npx tsx scripts/pr/pr-playwright-report.ts 17459914563     # Download and open report from specific run
  npx tsx scripts/pr/pr-playwright-report.ts 55 --open-only  # Just open previously downloaded report

This script:
1. Downloads the Playwright test report artifact from a GitHub Actions run
2. Opens it in your browser for interactive viewing
3. Shows test results, screenshots, and traces
`)
    process.exit(0)
  }
  
  const openOnly = args.includes('--open-only')
  
  if (openOnly) {
    openReport()
    return
  }
  
  const input = args[0]
  let runId: string | null = null
  
  // Check if input is a PR number (short) or run ID (long)
  if (input.length < 8) {
    console.log(`Finding latest CI run for PR #${input}...`)
    runId = getLatestRunForPR(input)
    
    if (!runId) {
      console.error(`Could not find a CI run for PR #${input}`)
      process.exit(1)
    }
    
    console.log(`Found run: ${runId}`)
  } else {
    runId = input
  }
  
  if (downloadPlaywrightReport(runId)) {
    openReport()
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\nStopping server...')
  process.exit(0)
})

main()