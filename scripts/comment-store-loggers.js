#!/usr/bin/env node

const fs = require('fs')

const filePath = 'src/renderer/store/useTaskStore.ts'
let content = fs.readFileSync(filePath, 'utf8')
const lines = content.split('\n')

// Track if we're in a multi-line logger call
let inLoggerCall = false
let parenDepth = 0
let modifiedCount = 0

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]

  // Skip already commented lines
  if (line.trim().startsWith('//')) continue

  // Check if this line contains a logger call (including rendererLogger)
  if (!inLoggerCall && (line.includes('rendererLogger.') || line.includes('getRendererLogger()')) && !line.includes('import')) {
    inLoggerCall = true
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
      console.log('  Multi-line logger call commented')
    }
  }
}

// Write back
content = lines.join('\n')
fs.writeFileSync(filePath, content)

console.log(`\n✅ Done! Commented ${modifiedCount} logger calls in useTaskStore.ts`)
