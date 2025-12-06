/**
 * Coverage Utilities for MCP Tools
 *
 * Provides functions to parse and analyze code coverage data
 * from Vitest/V8 coverage reports.
 */

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

// Types for coverage data structures
interface CoverageMetric {
  total: number
  covered: number
  skipped: number
  pct: number
}

interface FileCoverageData {
  lines: CoverageMetric
  statements: CoverageMetric
  functions: CoverageMetric
  branches: CoverageMetric
}

interface CoverageSummary {
  total: FileCoverageData
  [filePath: string]: FileCoverageData
}

interface ModuleCoverage {
  name: string
  lines: number
  statements: number
  functions: number
  branches: number
  overall: number
  totalLines: number
  coveredLines: number
  uncoveredLines: number
}

interface UncoveredFile {
  file: string
  relativePath: string
  module: string
  linesCoverage: number
  totalLines: number
  uncoveredLines: number
  impactScore: number
}

interface V8StatementMap {
  [key: string]: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  }
}

interface V8FnMap {
  [key: string]: {
    name: string
    decl: { start: { line: number; column: number }; end: { line: number; column: number } }
    loc: { start: { line: number; column: number }; end: { line: number; column: number } }
    line: number
  }
}

interface V8FileCoverage {
  path: string
  statementMap: V8StatementMap
  fnMap: V8FnMap
  branchMap: Record<string, unknown>
  s: Record<string, number>
  f: Record<string, number>
  b: Record<string, number[]>
}

interface FileCoverageDetail {
  file: string
  linesCoverage: number
  statementsCoverage: number
  functionsCoverage: number
  branchesCoverage: number
  uncoveredLineRanges: string[]
  uncoveredFunctions: string[]
  totalLines: number
  coveredLines: number
}

interface PatchCoverageResult {
  patchCoverage: number
  totalChangedLines: number
  coveredChangedLines: number
  changedFiles: Array<{
    file: string
    addedLines: number
    coveredLines: number
    coverage: number
    uncoveredLines: number[]
  }>
}

// Use process.cwd() because __dirname points to dist/ when running compiled MCP
const PROJECT_ROOT = process.cwd()
const COVERAGE_DIR = path.join(PROJECT_ROOT, 'coverage')

/**
 * Get the coverage summary from coverage-summary.json
 */
export function getCoverageSummary(): { lines: number; statements: number; functions: number; branches: number } | null {
  const summaryPath = path.join(COVERAGE_DIR, 'coverage-summary.json')

  if (!fs.existsSync(summaryPath)) {
    return null
  }

  const data = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as CoverageSummary

  if (!data.total) {
    return null
  }

  return {
    lines: data.total.lines.pct,
    statements: data.total.statements.pct,
    functions: data.total.functions.pct,
    branches: data.total.branches.pct,
  }
}

/**
 * Get coverage breakdown by module (shared, main, renderer, logger)
 */
export function getCoverageByModule(): ModuleCoverage[] {
  const summaryPath = path.join(COVERAGE_DIR, 'coverage-summary.json')

  if (!fs.existsSync(summaryPath)) {
    return []
  }

  const coverage = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as CoverageSummary

  // Group by module
  const modules: Record<string, { lines: { total: number; covered: number }; statements: { total: number; covered: number }; functions: { total: number; covered: number }; branches: { total: number; covered: number } }> = {}

  Object.entries(coverage).forEach(([file, data]) => {
    if (file === 'total') return

    const parts = file.split('/')
    let moduleName = 'root'

    if (parts.includes('src')) {
      const srcIndex = parts.indexOf('src')
      if (parts[srcIndex + 1]) {
        moduleName = parts[srcIndex + 1]
      }
    }

    if (!modules[moduleName]) {
      modules[moduleName] = {
        lines: { total: 0, covered: 0 },
        statements: { total: 0, covered: 0 },
        functions: { total: 0, covered: 0 },
        branches: { total: 0, covered: 0 },
      }
    }

    modules[moduleName].lines.total += data.lines.total
    modules[moduleName].lines.covered += data.lines.covered
    modules[moduleName].statements.total += data.statements.total
    modules[moduleName].statements.covered += data.statements.covered
    modules[moduleName].functions.total += data.functions.total
    modules[moduleName].functions.covered += data.functions.covered
    modules[moduleName].branches.total += data.branches.total
    modules[moduleName].branches.covered += data.branches.covered
  })

  // Calculate percentages and sort
  return Object.entries(modules)
    .map(([name, data]) => {
      const lines = data.lines.total > 0 ? (data.lines.covered / data.lines.total) * 100 : 0
      const statements = data.statements.total > 0 ? (data.statements.covered / data.statements.total) * 100 : 0
      const functions = data.functions.total > 0 ? (data.functions.covered / data.functions.total) * 100 : 0
      const branches = data.branches.total > 0 ? (data.branches.covered / data.branches.total) * 100 : 0

      return {
        name,
        lines,
        statements,
        functions,
        branches,
        overall: (lines + statements + functions + branches) / 4,
        totalLines: data.lines.total,
        coveredLines: data.lines.covered,
        uncoveredLines: data.lines.total - data.lines.covered,
      }
    })
    .sort((a, b) => b.overall - a.overall)
}

/**
 * Get files with lowest coverage, sorted by impact potential
 */
export function getUncoveredFiles(options?: { module?: string; limit?: number; minLines?: number }): UncoveredFile[] {
  const summaryPath = path.join(COVERAGE_DIR, 'coverage-summary.json')

  if (!fs.existsSync(summaryPath)) {
    return []
  }

  const coverage = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as CoverageSummary
  const limit = options?.limit ?? 10
  const minLines = options?.minLines ?? 50

  const files: UncoveredFile[] = []

  Object.entries(coverage).forEach(([file, data]) => {
    if (file === 'total') return

    const parts = file.split('/')
    let moduleName = 'root'

    if (parts.includes('src')) {
      const srcIndex = parts.indexOf('src')
      if (parts[srcIndex + 1]) {
        moduleName = parts[srcIndex + 1]
      }
    }

    // Filter by module if specified
    if (options?.module && moduleName !== options.module) {
      return
    }

    const uncoveredLines = data.lines.total - data.lines.covered

    // Filter by minimum uncovered lines
    if (uncoveredLines < minLines) {
      return
    }

    // Calculate impact score: more uncovered lines + lower current coverage = higher impact
    const impactScore = uncoveredLines * (100 - data.lines.pct)

    // Get relative path
    const relativePath = file.replace(PROJECT_ROOT + '/', '')

    files.push({
      file,
      relativePath,
      module: moduleName,
      linesCoverage: data.lines.pct,
      totalLines: data.lines.total,
      uncoveredLines,
      impactScore,
    })
  })

  return files.sort((a, b) => b.impactScore - a.impactScore).slice(0, limit)
}

/**
 * Get detailed coverage for a specific file including uncovered line numbers
 */
export function getFileCoverage(filePath: string): FileCoverageDetail | null {
  const finalPath = path.join(COVERAGE_DIR, 'coverage-final.json')
  const summaryPath = path.join(COVERAGE_DIR, 'coverage-summary.json')

  if (!fs.existsSync(finalPath) || !fs.existsSync(summaryPath)) {
    return null
  }

  // Resolve the file path
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath)

  // Get summary data for percentages
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as CoverageSummary
  const summaryData = summary[absolutePath]

  if (!summaryData) {
    return null
  }

  // Get detailed V8 coverage
  const finalData = JSON.parse(fs.readFileSync(finalPath, 'utf8')) as Record<string, V8FileCoverage>
  const fileData = finalData[absolutePath]

  if (!fileData) {
    return {
      file: filePath,
      linesCoverage: summaryData.lines.pct,
      statementsCoverage: summaryData.statements.pct,
      functionsCoverage: summaryData.functions.pct,
      branchesCoverage: summaryData.branches.pct,
      uncoveredLineRanges: [],
      uncoveredFunctions: [],
      totalLines: summaryData.lines.total,
      coveredLines: summaryData.lines.covered,
    }
  }

  // Find uncovered lines from statement map
  const uncoveredLines = new Set<number>()
  const coveredLines = new Set<number>()

  Object.entries(fileData.statementMap).forEach(([key, loc]) => {
    const count = fileData.s[key]
    for (let line = loc.start.line; line <= loc.end.line; line++) {
      if (count === 0) {
        uncoveredLines.add(line)
      } else {
        coveredLines.add(line)
      }
    }
  })

  // Remove lines that are covered somewhere
  coveredLines.forEach((line) => uncoveredLines.delete(line))

  // Convert to ranges
  const uncoveredLineRanges = compressToRanges(Array.from(uncoveredLines).sort((a, b) => a - b))

  // Find uncovered functions
  const uncoveredFunctions: string[] = []
  Object.entries(fileData.fnMap).forEach(([key, fn]) => {
    if (fileData.f[key] === 0) {
      uncoveredFunctions.push(`${fn.name || 'anonymous'} (line ${fn.line})`)
    }
  })

  return {
    file: filePath,
    linesCoverage: summaryData.lines.pct,
    statementsCoverage: summaryData.statements.pct,
    functionsCoverage: summaryData.functions.pct,
    branchesCoverage: summaryData.branches.pct,
    uncoveredLineRanges,
    uncoveredFunctions,
    totalLines: summaryData.lines.total,
    coveredLines: summaryData.lines.covered,
  }
}

/**
 * Get patch coverage for files changed since base branch
 */
export function getPatchCoverage(base = 'main'): PatchCoverageResult | null {
  const finalPath = path.join(COVERAGE_DIR, 'coverage-final.json')

  if (!fs.existsSync(finalPath)) {
    return null
  }

  // Get changed files with line numbers
  let diffOutput: string
  try {
    diffOutput = execSync(`git diff --unified=0 ${base}...HEAD`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch {
    // If git diff fails, try without the range (for uncommitted changes)
    try {
      diffOutput = execSync(`git diff --unified=0 ${base}`, {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      })
    } catch {
      return null
    }
  }

  // Parse diff to get changed line numbers per file
  const changedLinesByFile = parseDiffForAddedLines(diffOutput)

  if (Object.keys(changedLinesByFile).length === 0) {
    return {
      patchCoverage: 100,
      totalChangedLines: 0,
      coveredChangedLines: 0,
      changedFiles: [],
    }
  }

  // Load coverage data
  const finalData = JSON.parse(fs.readFileSync(finalPath, 'utf8')) as Record<string, V8FileCoverage>

  let totalChangedLines = 0
  let coveredChangedLines = 0
  const changedFiles: PatchCoverageResult['changedFiles'] = []

  Object.entries(changedLinesByFile).forEach(([relativePath, addedLines]) => {
    const absolutePath = path.join(PROJECT_ROOT, relativePath)
    const fileData = finalData[absolutePath]

    const fileAddedLines = addedLines.length
    totalChangedLines += fileAddedLines

    if (!fileData) {
      // File not in coverage (might be excluded or new)
      changedFiles.push({
        file: relativePath,
        addedLines: fileAddedLines,
        coveredLines: 0,
        coverage: 0,
        uncoveredLines: addedLines,
      })
      return
    }

    // Build set of covered lines
    const coveredLinesSet = new Set<number>()
    Object.entries(fileData.statementMap).forEach(([key, loc]) => {
      if (fileData.s[key] > 0) {
        for (let line = loc.start.line; line <= loc.end.line; line++) {
          coveredLinesSet.add(line)
        }
      }
    })

    // Check which added lines are covered
    const fileCoveredLines = addedLines.filter((line) => coveredLinesSet.has(line))
    const fileUncoveredLines = addedLines.filter((line) => !coveredLinesSet.has(line))
    coveredChangedLines += fileCoveredLines.length

    changedFiles.push({
      file: relativePath,
      addedLines: fileAddedLines,
      coveredLines: fileCoveredLines.length,
      coverage: fileAddedLines > 0 ? (fileCoveredLines.length / fileAddedLines) * 100 : 100,
      uncoveredLines: fileUncoveredLines,
    })
  })

  return {
    patchCoverage: totalChangedLines > 0 ? (coveredChangedLines / totalChangedLines) * 100 : 100,
    totalChangedLines,
    coveredChangedLines,
    changedFiles: changedFiles.sort((a, b) => a.coverage - b.coverage),
  }
}

/**
 * Parse git diff output to extract added line numbers per file
 */
function parseDiffForAddedLines(diffOutput: string): Record<string, number[]> {
  const result: Record<string, number[]> = {}
  let currentFile: string | null = null

  const lines = diffOutput.split('\n')

  for (const line of lines) {
    // Match file header: +++ b/src/some/file.ts
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/)
    if (fileMatch) {
      currentFile = fileMatch[1]
      // Only track TypeScript/JavaScript files
      if (!/\.(ts|tsx|js|jsx)$/.test(currentFile)) {
        currentFile = null
      }
      continue
    }

    // Match hunk header: @@ -old,count +new,count @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (hunkMatch && currentFile) {
      const startLine = parseInt(hunkMatch[1], 10)
      const lineCount = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1

      if (!result[currentFile]) {
        result[currentFile] = []
      }

      // Add all lines in the range
      for (let i = 0; i < lineCount; i++) {
        result[currentFile].push(startLine + i)
      }
    }
  }

  return result
}

/**
 * Compress line numbers into ranges (e.g., [1,2,3,5,6,7] -> ["1-3", "5-7"])
 */
function compressToRanges(lines: number[]): string[] {
  if (lines.length === 0) return []

  const ranges: string[] = []
  let rangeStart = lines[0]
  let rangeEnd = lines[0]

  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === rangeEnd + 1) {
      rangeEnd = lines[i]
    } else {
      ranges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`)
      rangeStart = lines[i]
      rangeEnd = lines[i]
    }
  }

  ranges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`)

  return ranges
}

/**
 * Check if coverage data exists
 */
export function coverageExists(): boolean {
  return fs.existsSync(path.join(COVERAGE_DIR, 'coverage-summary.json'))
}
