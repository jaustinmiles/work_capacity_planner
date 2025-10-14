#!/usr/bin/env node

const fs = require('fs')

const filePath = 'src/main/database.ts'
let content = fs.readFileSync(filePath, 'utf8')
const lines = content.split('\n')

// Track if we're in a multi-line logger call
let inLoggerCall = false
let parenDepth = 0
let startLine = -1

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]

  // Skip already commented lines
  if (line.trim().startsWith('//')) continue

  // Check if this line starts a logger call
  if (!inLoggerCall && line.includes('mainLogger.') && !line.includes('= mainLogger') && !line.includes('mainLogger.setPrisma') && !line.includes('mainLogger.child')) {
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
      console.log(`Commented multi-line logger from lines ${startLine + 1} to ${i + 1}`)
    }
  }
}

// Write back
content = lines.join('\n')
fs.writeFileSync(filePath, content)
console.log('Done commenting out logger calls in database.ts')
