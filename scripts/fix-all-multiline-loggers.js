#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const glob = require('glob')

function fixFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')

  let modified = false
  let inLoggerBlock = false
  let depth = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Check if this starts a logger block
    if (trimmed.startsWith('// LOGGER_REMOVED') && line.includes('{')) {
      inLoggerBlock = true
      // Count parentheses and braces
      const afterComment = line.substring(line.indexOf('// LOGGER_REMOVED'))
      depth = (afterComment.match(/[{(]/g) || []).length - (afterComment.match(/[})]/g) || []).length
      continue
    }

    // If we're in a logger block and depth > 0
    if (inLoggerBlock && depth > 0) {
      // Update depth based on this line
      depth += (line.match(/[{(]/g) || []).length - (line.match(/[})]/g) || []).length

      // If line is not commented, comment it out
      if (!trimmed.startsWith('//')) {
        const leadingWhitespace = line.match(/^(\s*)/)[1]
        lines[i] = leadingWhitespace + '// ' + line.trim()
        modified = true
      }

      // If depth is back to 0, we're done with this block
      if (depth <= 0) {
        inLoggerBlock = false
        depth = 0
      }
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, lines.join('\n'))
    return true
  }
  return false
}

// Find all TypeScript files
const files = glob.sync('src/**/*.{ts,tsx}', {
  ignore: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/*.test.tsx'],
})

console.log(`Found ${files.length} files to check...`)

let fixedCount = 0
for (const file of files) {
  if (fixFile(file)) {
    console.log(`✅ Fixed: ${file}`)
    fixedCount++
  }
}

console.log(`\n${fixedCount} files fixed.`)
