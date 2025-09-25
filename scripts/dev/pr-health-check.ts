#!/usr/bin/env tsx
/**
 * PR Health Check Script
 * Automated checking for common PR issues before pushing
 *
 * Usage: npx tsx scripts/dev/pr-health-check.ts [--fix]
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

interface HealthCheck {
  name: string
  description: string
  check: () => { passed: boolean; details: string; fixable?: boolean }
  fix?: () => void
}

class PRHealthChecker {
  private checks: HealthCheck[] = []
  private issues: Array<{ check: string; details: string; fixable: boolean }> = []
  private fixMode: boolean = false

  constructor() {
    this.fixMode = process.argv.includes('--fix')
    this.setupChecks()
  }

  private setupChecks(): void {
    this.checks = [
      {
        name: 'TypeScript Errors',
        description: 'Check for TypeScript compilation errors',
        check: () => {
          try {
            execSync('npm run typecheck', { stdio: 'pipe' })
            return { passed: true, details: 'No TypeScript errors' }
          } catch (error: any) {
            const output = error.stdout?.toString() || ''
            const errorCount = (output.match(/error TS/g) || []).length
            return {
              passed: false,
              details: `Found ${errorCount} TypeScript errors`,
              fixable: false
            }
          }
        }
      },
      {
        name: 'ESLint Errors',
        description: 'Check for ESLint errors',
        check: () => {
          try {
            const result = execSync('npm run lint 2>&1 || true', { encoding: 'utf8' })
            const errorMatch = result.match(/(\d+) errors?/)
            const errorCount = errorMatch ? parseInt(errorMatch[1]) : 0

            if (errorCount === 0) {
              return { passed: true, details: 'No ESLint errors' }
            }
            return {
              passed: false,
              details: `Found ${errorCount} ESLint errors`,
              fixable: true
            }
          } catch {
            return { passed: false, details: 'ESLint check failed', fixable: false }
          }
        },
        fix: () => {
          console.log('  Running ESLint with --fix...')
          execSync('npm run lint -- --fix', { stdio: 'inherit' })
        }
      },
      {
        name: 'Any Type Usage',
        description: 'Check for "any" type usage',
        check: () => {
          const result = execSync('grep -r "as any" src/ 2>/dev/null || true', { encoding: 'utf8' })
          const lines = result.split('\n').filter(line => line && !line.includes('.test.'))

          if (lines.length === 0) {
            return { passed: true, details: 'No "as any" usage found' }
          }
          return {
            passed: false,
            details: `Found ${lines.length} instances of "as any":\n${lines.slice(0, 5).join('\n')}`,
            fixable: false
          }
        }
      },
      {
        name: 'Type Assertions',
        description: 'Check for suspicious type assertions',
        check: () => {
          const result = execSync('grep -r "as unknown as" src/ 2>/dev/null || true', { encoding: 'utf8' })
          const lines = result.split('\n').filter(line => line.trim())

          if (lines.length === 0) {
            return { passed: true, details: 'No "as unknown as" usage found' }
          }
          return {
            passed: false,
            details: `Found ${lines.length} instances of "as unknown as":\n${lines.slice(0, 5).join('\n')}`,
            fixable: false
          }
        }
      },
      {
        name: 'Console Logs',
        description: 'Check for console.log statements',
        check: () => {
          const result = execSync('grep -r "console\\.log" src/ 2>/dev/null | grep -v test || true', { encoding: 'utf8' })
          const lines = result.split('\n').filter(line => line.trim())

          if (lines.length === 0) {
            return { passed: true, details: 'No console.log statements in production code' }
          }
          return {
            passed: false,
            details: `Found ${lines.length} console.log statements:\n${lines.slice(0, 5).join('\n')}`,
            fixable: false
          }
        }
      },
      {
        name: 'TypeScript Ignore',
        description: 'Check for @ts-ignore usage',
        check: () => {
          const result = execSync('grep -r "@ts-ignore" src/ 2>/dev/null || true', { encoding: 'utf8' })
          const lines = result.split('\n').filter(line => line.trim())

          if (lines.length === 0) {
            return { passed: true, details: 'No @ts-ignore found' }
          }
          return {
            passed: false,
            details: `Found ${lines.length} @ts-ignore directives:\n${lines.slice(0, 5).join('\n')}`,
            fixable: false
          }
        }
      },
      {
        name: 'Optional Chaining Misuse',
        description: 'Check for optional chaining hiding missing methods',
        check: () => {
          const result = execSync('grep -r "\\?\\..*\\?\\." src/ 2>/dev/null | grep -v test || true', { encoding: 'utf8' })
          const lines = result.split('\n').filter(line => line.trim())

          if (lines.length === 0) {
            return { passed: true, details: 'No suspicious optional chaining found' }
          }
          return {
            passed: false,
            details: `Found ${lines.length} instances of multiple optional chaining:\n${lines.slice(0, 5).join('\n')}`,
            fixable: false
          }
        }
      },
      {
        name: 'TODO Comments',
        description: 'Check for undocumented TODOs',
        check: () => {
          const todos = execSync('grep -r "TODO" src/ 2>/dev/null || true', { encoding: 'utf8' })
          const todoLines = todos.split('\n').filter(line => line.trim())

          if (todoLines.length === 0) {
            return { passed: true, details: 'No TODO comments found' }
          }

          // Check if TODOs are documented in TECH_DEBT.md
          const techDebtPath = path.join(process.cwd(), 'TECH_DEBT.md')
          if (fs.existsSync(techDebtPath)) {
            const techDebt = fs.readFileSync(techDebtPath, 'utf8')
            const undocumented = todoLines.filter(line => {
              const todoText = line.split('TODO')[1]?.split(':')[1]?.trim()
              return todoText && !techDebt.includes(todoText)
            })

            if (undocumented.length === 0) {
              return { passed: true, details: `${todoLines.length} TODOs found, all documented in TECH_DEBT.md` }
            }
            return {
              passed: false,
              details: `Found ${undocumented.length} undocumented TODOs:\n${undocumented.slice(0, 3).join('\n')}`,
              fixable: false
            }
          }

          return {
            passed: false,
            details: `Found ${todoLines.length} TODOs but TECH_DEBT.md not found`,
            fixable: false
          }
        }
      },
      {
        name: 'File Count',
        description: 'Check if PR is too large',
        check: () => {
          const changes = execSync('git diff --cached --name-only 2>/dev/null || git diff --name-only', { encoding: 'utf8' })
          const files = changes.split('\n').filter(f => f.trim() && !f.includes('test'))

          if (files.length <= 20) {
            return { passed: true, details: `${files.length} files changed (within limit)` }
          }
          return {
            passed: false,
            details: `${files.length} files changed (exceeds limit of 20). Consider splitting the PR.`,
            fixable: false
          }
        }
      },
      {
        name: 'Test Coverage',
        description: 'Check if tests are included',
        check: () => {
          const changes = execSync('git diff --cached --name-only 2>/dev/null || git diff --name-only', { encoding: 'utf8' })
          const srcFiles = changes.split('\n').filter(f => f.includes('src/') && f.endsWith('.ts') && !f.includes('test'))
          const testFiles = changes.split('\n').filter(f => f.includes('test'))

          if (srcFiles.length === 0 || testFiles.length > 0) {
            return { passed: true, details: testFiles.length > 0 ? `${testFiles.length} test files included` : 'No source changes requiring tests' }
          }
          return {
            passed: false,
            details: `${srcFiles.length} source files changed but no test files included`,
            fixable: false
          }
        }
      },
      {
        name: 'Commit Size',
        description: 'Check for atomic commits',
        check: () => {
          try {
            const log = execSync('git log origin/main..HEAD --oneline 2>/dev/null || git log -10 --oneline', { encoding: 'utf8' })
            const commits = log.split('\n').filter(line => line.trim())

            if (commits.length <= 1) {
              return { passed: true, details: 'Single commit (good for small changes)' }
            }

            if (commits.length <= 10) {
              return { passed: true, details: `${commits.length} commits (reasonable)` }
            }

            return {
              passed: false,
              details: `${commits.length} commits (consider squashing). Recent:\n${commits.slice(0, 5).join('\n')}`,
              fixable: true
            }
          } catch {
            return { passed: true, details: 'Unable to check commit count' }
          }
        },
        fix: () => {
          console.log('  Consider running: git rebase -i origin/main')
          console.log('  Then mark commits as "squash" except the first')
        }
      }
    ]
  }

  private runCheck(check: HealthCheck): void {
    process.stdout.write(`\n🔍 ${check.name}... `)
    const result = check.check()

    if (result.passed) {
      console.log('✅')
      if (result.details !== `No ${check.name.toLowerCase()}`) {
        console.log(`   ${result.details}`)
      }
    } else {
      console.log('❌')
      console.log(`   ${result.details}`)

      this.issues.push({
        check: check.name,
        details: result.details,
        fixable: result.fixable || false
      })

      if (this.fixMode && result.fixable && check.fix) {
        check.fix()
      }
    }
  }

  public run(): void {
    console.log('╔════════════════════════════════════════════════════════════╗')
    console.log('║                    PR HEALTH CHECK                        ║')
    console.log('╚════════════════════════════════════════════════════════════╝')

    if (this.fixMode) {
      console.log('\n🔧 Running in FIX mode - will attempt to fix issues\n')
    }

    // Run all checks
    for (const check of this.checks) {
      this.runCheck(check)
    }

    // Summary
    console.log('\n' + '═'.repeat(60))

    if (this.issues.length === 0) {
      console.log('\n✅ All checks passed! PR is healthy and ready to push.\n')
      process.exit(0)
    } else {
      console.log(`\n❌ Found ${this.issues.length} issue(s):\n`)

      const fixableCount = this.issues.filter(i => i.fixable).length
      const unfixableCount = this.issues.length - fixableCount

      if (unfixableCount > 0) {
        console.log('Issues requiring manual fix:')
        this.issues.filter(i => !i.fixable).forEach(issue => {
          console.log(`  • ${issue.check}`)
        })
      }

      if (fixableCount > 0 && !this.fixMode) {
        console.log(`\n💡 ${fixableCount} issue(s) can be auto-fixed. Run with --fix flag:`)
        console.log('   npx tsx scripts/dev/pr-health-check.ts --fix')
      }

      console.log('\n📋 Recommended actions:')
      console.log('  1. Fix the issues listed above')
      console.log('  2. Run this check again')
      console.log('  3. Update documentation if needed')
      console.log('  4. Consider splitting if PR is too large')

      process.exit(1)
    }
  }
}

// Run the health checker
if (require.main === module) {
  const checker = new PRHealthChecker()
  checker.run()
}

export { PRHealthChecker }