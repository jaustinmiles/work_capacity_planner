#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

// Get file from command line argument
const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: node comment-file-loggers.js <filepath>')
  process.exit(1)
}

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`)
  process.exit(1)
}

let content = fs.readFileSync(filePath, 'utf8')
const lines = content.split('\n')

// Track if we're in a multi-line logger call
let inLoggerCall = false
let parenDepth = 0
let startLine = -1
let modifiedCount = 0

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]

  // Skip already commented lines
  if (line.trim().startsWith('//')) continue

  // Check if this line starts a logger call (handle various logger patterns)
  const loggerPattern = /\b(logger|mainLogger|console\.log|console\.error|console\.warn|console\.info|console\.debug)\s*\.\s*\w+\s*\(/
  if (!inLoggerCall && loggerPattern.test(line)) {
    // Skip imports and type definitions
    if (line.includes('import') || line.includes('const logger =') || line.includes('let logger =')) continue

    inLoggerCall = true
    startLine = i
    parenDepth = 0

    // Count parentheses on this line
    for (const char of line) {
      if (char === '(') parenDepth++
      if (char === ')') parenDepth--
    }

    // If parentheses are balanced, it's a single line logger call
    if (parenDepth === 0) {
      lines[i] = line.replace(/^(\s*)/, '$1// ')
      inLoggerCall = false
      modifiedCount++
      console.log(`  Line ${i + 1}: Single-line logger call commented`)
    } else {
      lines[i] = line.replace(/^(\s*)/, '$1// ')
    }
  } else if (inLoggerCall) {
    // We're inside a multi-line logger call
    for (const char of line) {
      if (char === '(') parenDepth++
      if (char === ')') parenDepth--
    }

    lines[i] = line.replace(/^(\s*)/, '$1// ')

    // Check if we've closed all parentheses
    if (parenDepth === 0) {
      inLoggerCall = false
      modifiedCount++
      console.log(`  Lines ${startLine + 1}-${i + 1}: Multi-line logger call commented`)
    }
  }
}

// Write back
content = lines.join('\n')
fs.writeFileSync(filePath, content)

console.log(`\n✅ Done! Modified ${modifiedCount} logger calls in ${path.basename(filePath)}`)
