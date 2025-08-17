#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// Get ESLint output
console.log('Running ESLint to find unused variables...')
let eslintOutput
try {
  eslintOutput = execSync('npm run lint 2>&1', { encoding: 'utf8' })
} catch (error) {
  // ESLint exits with error code when there are lint errors
  eslintOutput = error.stdout || error.output?.join('') || ''
}

// Parse ESLint output for unused variable errors
// Match both relative and absolute paths
const unusedVarPattern = /^\s*(\d+):(\d+)\s+error\s+'([^']+)' is (assigned a value but never used|defined but never used)/gm
const lines = eslintOutput.split('\n')
const errors = []
let currentFile = null

for (const line of lines) {
  // Check if this line is a file path
  if (line.startsWith('/') || line.match(/^[A-Za-z]:\\/)) {
    currentFile = line.trim()
  } else if (currentFile) {
    // Check if this line is an error
    const match = unusedVarPattern.exec(line)
    if (match) {
      errors.push({
        file: currentFile,
        line: parseInt(match[1]),
        column: parseInt(match[2]),
        varName: match[3],
      })
    }
  }
}

if (errors.length === 0) {
  console.log('No unused variable errors found!')
  process.exit(0)
}

console.log(`Found ${errors.length} unused variable errors`)

// Group by file
const fileMap = new Map()
for (const error of errors) {
  const fullPath = path.resolve(error.file)

  if (!fileMap.has(fullPath)) {
    fileMap.set(fullPath, [])
  }

  fileMap.get(fullPath).push({
    line: error.line,
    column: error.column,
    varName: error.varName,
  })
}

// Process each file
for (const [filePath, fileErrors] of fileMap) {
  console.log(`\nProcessing ${path.relative(process.cwd(), filePath)}...`)

  // Read file
  let content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')

  // Sort errors by line number in reverse (to process from bottom to top)
  fileErrors.sort((a, b) => b.line - a.line)

  for (const error of fileErrors) {
    const lineIndex = error.line - 1
    const line = lines[lineIndex]

    if (!line) continue

    console.log(`  Line ${error.line}: Processing unused variable '${error.varName}'`)

    // Pattern 1: const { unused, ...rest } = something
    // Remove just the unused variable from destructuring
    const destructurePattern = new RegExp(`([{,]\\s*)${error.varName}(\\s*[,}])`)
    if (destructurePattern.test(line)) {
      lines[lineIndex] = line.replace(destructurePattern, (match, before, after) => {
        // If it's { unused } or { unused, ... } or { ..., unused }
        if (before === '{' && after === '}') {
          // Single item destructuring - might need to remove entire statement
          return '{}'
        } else if (before.includes(',') && after === '}') {
          // Last item with comma before it: ", unused }"
          return after
        } else if (before === '{' && after.includes(',')) {
          // First item with comma after it: "{ unused, "
          return before
        } else if (before.includes(',') && after.includes(',')) {
          // Middle item: ", unused, "
          return after
        }
        return match
      })

      // Clean up empty destructuring or double commas
      lines[lineIndex] = lines[lineIndex]
        .replace(/,\s*,/g, ',')  // Remove double commas
        .replace(/{\s*}/g, '{}') // Normalize empty destructuring
        .replace(/,\s*}/g, '}')  // Remove trailing comma before }
        .replace(/{\s*,/g, '{')  // Remove leading comma after {

      // If the line becomes just an empty destructuring assignment, prefix with underscore
      if (/^\s*const\s*{\s*}\s*=/.test(lines[lineIndex])) {
        // Instead of commenting out, use underscore to ignore
        lines[lineIndex] = lines[lineIndex].replace(/const\s*{\s*}/, 'const _unused')
      }
      console.log('    Removed from destructuring')
      continue
    }

    // Pattern 2: const unused = something
    const simpleAssignPattern = new RegExp(`^(\\s*)(const|let|var)\\s+${error.varName}\\s*=`)
    if (simpleAssignPattern.test(line)) {
      // Prefix with underscore instead of commenting out
      lines[lineIndex] = line.replace(
        new RegExp(`\\b${error.varName}\\b`),
        `_${error.varName}`,
      )
      console.log(`    Prefixed with underscore: _${error.varName}`)
      continue
    }

    // Pattern 3: Function parameters - prefix with underscore
    // Check if it's in a function declaration or arrow function
    const functionPattern = new RegExp(`\\b${error.varName}\\b`)
    if (functionPattern.test(line) && (
      line.includes('function') ||
      line.includes('=>') ||
      line.includes('(') ||
      line.match(/^\s*\w+\s*\([^)]*\)/) // method signature
    )) {
      // Replace the variable with underscore-prefixed version
      lines[lineIndex] = line.replace(
        new RegExp(`\\b${error.varName}\\b`),
        `_${error.varName}`,
      )
      console.log(`    Prefixed parameter with underscore: _${error.varName}`)
      continue
    }

    // Pattern 4: Import statements - remove unused imports
    if (line.includes('import') && line.includes(error.varName)) {
      // Handle different import patterns
      if (line.includes('{') && line.includes('}')) {
        // Named import
        const importPattern = new RegExp(`\\b${error.varName}\\b\\s*,?`)
        lines[lineIndex] = line.replace(importPattern, '')

        // Clean up any remaining commas
        lines[lineIndex] = lines[lineIndex]
          .replace(/,\s*,/g, ',')
          .replace(/{\s*,/g, '{')
          .replace(/,\s*}/g, '}')
          .replace(/{\s*}/g, '{}')

        // If import becomes empty, comment it out
        if (lines[lineIndex].match(/import\s*{\s*}\s*from/)) {
          lines[lineIndex] = '// ' + lines[lineIndex] + ' // Removed unused import'
        }
      } else {
        // Default import - comment out entire line
        lines[lineIndex] = '// ' + lines[lineIndex] + ' // Removed unused import'
      }

      console.log(`    Removed from import: ${error.varName}`)
      continue
    }

    // Pattern 5: catch (e) - replace with underscore
    const catchPattern = new RegExp(`catch\\s*\\(\\s*${error.varName}\\s*\\)`)
    if (catchPattern.test(line)) {
      lines[lineIndex] = line.replace(catchPattern, `catch (_${error.varName})`)
      console.log(`    Prefixed catch parameter: _${error.varName}`)
      continue
    }

    // Pattern 6: Simple variable declaration without assignment (just defined)
    const simpleDefPattern = new RegExp(`^(\\s*)(const|let|var)\\s+${error.varName}\\s*$`)
    if (simpleDefPattern.test(line)) {
      lines[lineIndex] = '// ' + line + ' // Removed unused variable'
      console.log('    Commented out unused declaration')
      continue
    }

    console.log(`    Could not automatically fix '${error.varName}'`)
  }

  // Write back the modified content
  content = lines.join('\n')
  fs.writeFileSync(filePath, content)
  console.log(`  Updated ${path.relative(process.cwd(), filePath)}`)
}

console.log('\nDone! Re-run ESLint to see remaining errors.')
console.log('Variables prefixed with _ are ignored by ESLint rules.')
