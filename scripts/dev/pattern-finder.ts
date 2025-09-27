#!/usr/bin/env tsx
/**
 * Pattern Finder Script
 * Finds common anti-patterns in the codebase based on PR #76 lessons
 *
 * Usage: npx tsx scripts/dev/pattern-finder.ts [--fix] [--pattern <name>]
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

interface AntiPattern {
  name: string
  description: string
  searchCommand: string
  parseResults: (output: string) => PatternInstance[]
  severity: 'error' | 'warning' | 'info'
  autoFixable: boolean
  fix?: (instances: PatternInstance[]) => void
}

interface PatternInstance {
  file: string
  line: number
  content: string
  context?: string
}

class PatternFinder {
  private patterns: AntiPattern[] = []
  private results: Map<string, PatternInstance[]> = new Map()
  private fixMode: boolean = false
  private specificPattern?: string

  constructor() {
    this.fixMode = process.argv.includes('--fix')
    const patternIndex = process.argv.indexOf('--pattern')
    if (patternIndex !== -1 && process.argv[patternIndex + 1]) {
      this.specificPattern = process.argv[patternIndex + 1]
    }
    this.setupPatterns()
  }

  private setupPatterns(): void {
    this.patterns = [
      {
        name: 'any-type',
        description: 'Type assertions using "as any"',
        searchCommand: 'grep -rn "as any" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v test || true',
        severity: 'error',
        autoFixable: false,
        parseResults: (output: string) => this.parseGrepResults(output),
      },
      {
        name: 'unknown-cast',
        description: 'Double type assertions using "as unknown as"',
        searchCommand: 'grep -rn "as unknown as" src/ --include="*.ts" --include="*.tsx" 2>/dev/null || true',
        severity: 'error',
        autoFixable: false,
        parseResults: (output: string) => this.parseGrepResults(output),
      },
      {
        name: 'console-log',
        description: 'Console.log statements in production code',
        searchCommand: 'grep -rn "console\\.log" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v test || true',
        severity: 'warning',
        autoFixable: true,
        parseResults: (output: string) => this.parseGrepResults(output),
        fix: (instances) => this.fixConsoleLogs(instances),
      },
      {
        name: 'string-literals',
        description: 'String literals that might need to be enums',
        searchCommand: 'grep -rn "\\(focused\\|admin\\|mixed\\|personal\\|flexible\\|universal\\)" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "enum\\|type\\|interface" || true',
        severity: 'warning',
        autoFixable: false,
        parseResults: (output: string) => this.parseGrepResults(output),
      },
      {
        name: 'ts-ignore',
        description: '@ts-ignore directives',
        searchCommand: 'grep -rn "@ts-ignore" src/ --include="*.ts" --include="*.tsx" 2>/dev/null || true',
        severity: 'error',
        autoFixable: false,
        parseResults: (output: string) => this.parseGrepResults(output),
      },
      {
        name: 'todo-comments',
        description: 'TODO comments not documented in TECH_DEBT.md',
        searchCommand: 'grep -rn "TODO\\|FIXME\\|HACK" src/ --include="*.ts" --include="*.tsx" 2>/dev/null || true',
        severity: 'info',
        autoFixable: false,
        parseResults: (output: string) => {
          const instances = this.parseGrepResults(output)
          // Check if documented
          if (instances.length > 0 && fs.existsSync('TECH_DEBT.md')) {
            const techDebt = fs.readFileSync('TECH_DEBT.md', 'utf8')
            return instances.filter(instance => {
              const todoText = instance.content.split(/TODO|FIXME|HACK/)[1]?.trim()
              return todoText && !techDebt.includes(todoText.substring(0, 20))
            })
          }
          return instances
        },
      },
      {
        name: 'optional-chaining-abuse',
        description: 'Multiple optional chaining that might hide missing methods',
        searchCommand: 'grep -rn "\\?\\..*\\?\\." src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v test || true',
        severity: 'warning',
        autoFixable: false,
        parseResults: (output: string) => this.parseGrepResults(output),
      },
      {
        name: 'duplicate-imports',
        description: 'Duplicate or redundant import statements',
        searchCommand: 'find src -name "*.ts" -o -name "*.tsx" | xargs -I {} sh -c "grep -h \"^import\" {} | sort | uniq -d | head -20" 2>/dev/null || true',
        severity: 'info',
        autoFixable: false,
        parseResults: (output: string) => {
          if (!output.trim()) return []
          return output.split('\n').filter(line => line.trim()).map(line => ({
            file: 'Multiple files',
            line: 0,
            content: line,
          }))
        },
      },
      {
        name: 'long-functions',
        description: 'Functions longer than 100 lines',
        searchCommand: '',
        severity: 'warning',
        autoFixable: false,
        parseResults: () => this.findLongFunctions(),
      },
      {
        name: 'magic-numbers',
        description: 'Magic numbers that should be constants',
        searchCommand: 'grep -rn "[^0-9]\\(30\\|60\\|90\\|120\\|180\\|240\\|300\\|360\\|420\\|480\\)[^0-9]" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "test\\|const\\|enum" || true',
        severity: 'info',
        autoFixable: false,
        parseResults: (output: string) => this.parseGrepResults(output),
      },
    ]
  }

  private parseGrepResults(output: string): PatternInstance[] {
    if (!output.trim()) return []

    return output.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const match = line.match(/^([^:]+):(\d+):(.*)$/)
        if (!match) return null
        return {
          file: match[1],
          line: parseInt(match[2]),
          content: match[3].trim(),
        }
      })
      .filter((instance): instance is PatternInstance => instance !== null)
  }

  private findLongFunctions(): PatternInstance[] {
    const instances: PatternInstance[] = []
    const files = execSync('find src -name "*.ts" -o -name "*.tsx" 2>/dev/null || true', { encoding: 'utf8' })
      .split('\n')
      .filter(f => f.trim())

    for (const file of files) {
      if (file.includes('.test.')) continue

      try {
        const content = fs.readFileSync(file, 'utf8')
        const lines = content.split('\n')
        let inFunction = false
        let functionStart = 0
        let functionName = ''
        let braceCount = 0

        lines.forEach((line, index) => {
          const funcMatch = line.match(/^\s*(async\s+)?(?:function\s+)?(\w+)\s*\(|^\s*(?:const|let|var)\s+(\w+)\s*=.*=>|^\s*(\w+)\s*\(.*\)\s*\{/)

          if (funcMatch && !inFunction) {
            inFunction = true
            functionStart = index + 1
            functionName = funcMatch[2] || funcMatch[3] || funcMatch[4] || 'anonymous'
            braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length
          } else if (inFunction) {
            braceCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length

            if (braceCount === 0) {
              const functionLength = index - functionStart + 1
              if (functionLength > 100) {
                instances.push({
                  file,
                  line: functionStart,
                  content: `Function "${functionName}" is ${functionLength} lines long`,
                })
              }
              inFunction = false
            }
          }
        })
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return instances
  }

  private fixConsoleLogs(instances: PatternInstance[]): void {
    console.log(`\n🔧 Attempting to fix ${instances.length} console.log statements...`)

    const fileGroups = new Map<string, PatternInstance[]>()
    instances.forEach(instance => {
      if (!fileGroups.has(instance.file)) {
        fileGroups.set(instance.file, [])
      }
      fileGroups.get(instance.file)!.push(instance)
    })

    for (const [file, fileInstances] of fileGroups) {
      try {
        let content = fs.readFileSync(file, 'utf8')
        const lines = content.split('\n')

        // Check if logger is already imported
        const hasLoggerImport = lines.some(line =>
          line.includes('import') && line.includes('logger') && line.includes('from'),
        )

        if (!hasLoggerImport) {
          // Find the last import statement
          let lastImportIndex = -1
          lines.forEach((line, index) => {
            if (line.startsWith('import')) {
              lastImportIndex = index
            }
          })

          if (lastImportIndex !== -1) {
            lines.splice(lastImportIndex + 1, 0, "import { logger } from '@/shared/logger'")
            console.log(`  Added logger import to ${file}`)
          }
        }

        // Replace console.log with logger.info
        content = lines.join('\n')
        content = content.replace(/console\.log\(/g, 'logger.info(')

        fs.writeFileSync(file, content)
        console.log(`  Fixed console.log statements in ${file}`)
      } catch (error) {
        console.log(`  ❌ Failed to fix ${file}: ${error}`)
      }
    }
  }

  private runPattern(pattern: AntiPattern): void {
    process.stdout.write(`\n🔍 Checking ${pattern.name}... `)

    let output = ''
    if (pattern.searchCommand) {
      output = execSync(pattern.searchCommand, { encoding: 'utf8' })
    }

    const instances = pattern.parseResults(output)

    if (instances.length === 0) {
      console.log('✅')
      return
    }

    const emoji = pattern.severity === 'error' ? '❌' : pattern.severity === 'warning' ? '⚠️' : 'ℹ️'
    console.log(`${emoji} Found ${instances.length} instances`)

    this.results.set(pattern.name, instances)

    // Show first few instances
    instances.slice(0, 5).forEach(instance => {
      console.log(`   ${instance.file}:${instance.line}`)
      if (instance.content.length > 100) {
        console.log(`     ${instance.content.substring(0, 100)}...`)
      } else {
        console.log(`     ${instance.content}`)
      }
    })

    if (instances.length > 5) {
      console.log(`   ... and ${instances.length - 5} more`)
    }

    if (this.fixMode && pattern.autoFixable && pattern.fix) {
      pattern.fix(instances)
    }
  }

  public run(): void {
    console.log('╔════════════════════════════════════════════════════════════╗')
    console.log('║                    PATTERN FINDER                         ║')
    console.log('╚════════════════════════════════════════════════════════════╝')

    if (this.fixMode) {
      console.log('\n🔧 Running in FIX mode - will attempt to fix auto-fixable patterns\n')
    }

    if (this.specificPattern) {
      const pattern = this.patterns.find(p => p.name === this.specificPattern)
      if (!pattern) {
        console.log(`\n❌ Unknown pattern: ${this.specificPattern}`)
        console.log('\nAvailable patterns:')
        this.patterns.forEach(p => {
          console.log(`  - ${p.name}: ${p.description}`)
        })
        process.exit(1)
      }
      this.runPattern(pattern)
    } else {
      // Run all patterns
      for (const pattern of this.patterns) {
        this.runPattern(pattern)
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(60))

    let errorCount = 0
    let warningCount = 0
    let infoCount = 0

    for (const [patternName, instances] of this.results) {
      const pattern = this.patterns.find(p => p.name === patternName)!
      if (pattern.severity === 'error') {
        errorCount += instances.length
      } else if (pattern.severity === 'warning') {
        warningCount += instances.length
      } else {
        infoCount += instances.length
      }
    }

    console.log('\n📊 Summary:')
    console.log(`   Errors: ${errorCount}`)
    console.log(`   Warnings: ${warningCount}`)
    console.log(`   Info: ${infoCount}`)

    if (errorCount > 0) {
      console.log('\n❌ Found critical anti-patterns that must be fixed!')
      console.log('\n📋 Next steps:')
      console.log('  1. Fix all "error" level issues')
      console.log('  2. Consider fixing "warning" level issues')
      console.log('  3. Document any necessary exceptions in TECH_DEBT.md')
      console.log('  4. Run this script again to verify fixes')
      process.exit(1)
    } else if (warningCount > 0) {
      console.log('\n⚠️ Found patterns that should be reviewed')
      process.exit(0)
    } else {
      console.log('\n✅ No anti-patterns found! Code follows best practices.')
      process.exit(0)
    }
  }

  public static showHelp(): void {
    console.log(`
Pattern Finder - Find common anti-patterns in the codebase

Usage: npx tsx scripts/dev/pattern-finder.ts [options]

Options:
  --fix              Attempt to auto-fix fixable patterns
  --pattern <name>   Check only a specific pattern
  --help            Show this help message

Available patterns:
  - any-type         Type assertions using "as any"
  - unknown-cast     Double type assertions using "as unknown as"
  - console-log      Console.log statements in production code
  - string-literals  String literals that might need to be enums
  - ts-ignore        @ts-ignore directives
  - todo-comments    TODO comments not documented in TECH_DEBT.md
  - optional-chaining-abuse  Multiple optional chaining
  - duplicate-imports  Duplicate or redundant imports
  - long-functions   Functions longer than 100 lines
  - magic-numbers    Magic numbers that should be constants

Examples:
  npx tsx scripts/dev/pattern-finder.ts
  npx tsx scripts/dev/pattern-finder.ts --fix
  npx tsx scripts/dev/pattern-finder.ts --pattern console-log --fix
`)
  }
}

// Run the pattern finder
if (require.main === module) {
  if (process.argv.includes('--help')) {
    PatternFinder.showHelp()
    process.exit(0)
  }

  const finder = new PatternFinder()
  finder.run()
}

export { PatternFinder }
