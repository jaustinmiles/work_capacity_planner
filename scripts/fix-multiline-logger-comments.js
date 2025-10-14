#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const glob = require('glob')

// Find all TypeScript files
const files = glob.sync('src/**/*.{ts,tsx}', {
  ignore: ['**/node_modules/**', '**/dist/**'],
})

let totalFixed = 0
let filesModified = 0

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8')
  const lines = content.split('\n')
  let modified = false
  let inLoggerBlock = false
  let parenthesesDepth = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check if this is a commented logger line
    if (line.includes('// LOGGER_REMOVED: logger')) {
      inLoggerBlock = true
      // Count opening and closing parentheses
      const opens = (line.match(/\(/g) || []).length
      const closes = (line.match(/\)/g) || []).length
      parenthesesDepth = opens - closes
    } else if (inLoggerBlock && parenthesesDepth > 0) {
      // We're in a multi-line logger call that needs commenting
      if (!line.trim().startsWith('//')) {
        // This line is not commented but should be
        const opens = (line.match(/\(/g) || []).length
        const closes = (line.match(/\)/g) || []).length
        parenthesesDepth += opens - closes

        // Comment out this line, preserving indentation
        const leadingWhitespace = line.match(/^(\s*)/)[1]
        lines[i] = leadingWhitespace + '// LOGGER_REMOVED: ' + line.trim()
        modified = true
        totalFixed++

        // If we've closed all parentheses, we're done with this block
        if (parenthesesDepth <= 0) {
          inLoggerBlock = false
          parenthesesDepth = 0
        }
      }
    } else {
      // Reset if we're no longer in a logger block
      inLoggerBlock = false
      parenthesesDepth = 0
    }
  }

  if (modified) {
    fs.writeFileSync(file, lines.join('\n'))
    console.log(`Fixed: ${file}`)
    filesModified++
  }
})

console.log(`\n✅ Fixed ${totalFixed} orphaned logger lines in ${filesModified} files`)
