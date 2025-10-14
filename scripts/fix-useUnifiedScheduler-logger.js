#!/usr/bin/env node

const fs = require('fs')

const file = 'src/renderer/hooks/useUnifiedScheduler.ts'
const content = fs.readFileSync(file, 'utf8')
const lines = content.split('\n')

let modified = false
let inLoggerBlock = false
let parenthesesDepth = 0
let braceDepth = 0

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]

  // Check if this is a commented logger line that opens a block
  if (line.includes('// LOGGER_REMOVED') && line.includes('{')) {
    inLoggerBlock = true
    // Count opening and closing parentheses and braces
    const opens = (line.match(/\(/g) || []).length
    const closes = (line.match(/\)/g) || []).length
    const openBraces = (line.match(/\{/g) || []).length
    const closeBraces = (line.match(/\}/g) || []).length
    parenthesesDepth = opens - closes
    braceDepth = openBraces - closeBraces
  } else if (inLoggerBlock && (parenthesesDepth > 0 || braceDepth > 0)) {
    // We're in a multi-line logger call that needs commenting
    if (!line.trim().startsWith('//')) {
      // This line is not commented but should be
      const opens = (line.match(/\(/g) || []).length
      const closes = (line.match(/\)/g) || []).length
      const openBraces = (line.match(/\{/g) || []).length
      const closeBraces = (line.match(/\}/g) || []).length
      parenthesesDepth += opens - closes
      braceDepth += openBraces - closeBraces

      // Comment out this line, preserving indentation
      const leadingWhitespace = line.match(/^(\s*)/)[1]
      lines[i] = leadingWhitespace + '// ' + line.trim()
      modified = true

      // If we've closed all parentheses and braces, we're done with this block
      if (parenthesesDepth <= 0 && braceDepth <= 0) {
        inLoggerBlock = false
        parenthesesDepth = 0
        braceDepth = 0
      }
    } else {
      // Line is already commented, just update depth tracking
      const opens = (line.match(/\(/g) || []).length
      const closes = (line.match(/\)/g) || []).length
      const openBraces = (line.match(/\{/g) || []).length
      const closeBraces = (line.match(/\}/g) || []).length
      parenthesesDepth += opens - closes
      braceDepth += openBraces - closeBraces

      if (parenthesesDepth <= 0 && braceDepth <= 0) {
        inLoggerBlock = false
        parenthesesDepth = 0
        braceDepth = 0
      }
    }
  } else {
    // Reset if we're no longer in a logger block
    inLoggerBlock = false
    parenthesesDepth = 0
    braceDepth = 0
  }
}

if (modified) {
  fs.writeFileSync(file, lines.join('\n'))
  console.log(`✅ Fixed multi-line logger comments in ${file}`)
} else {
  console.log(`✓ No changes needed in ${file}`)
}
