#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const glob = require('glob')

// Find all TypeScript/JavaScript files
const files = glob.sync('src/**/*.{ts,tsx,js,jsx}', {
  ignore: ['**/node_modules/**', '**/dist/**', 'src/logger/**'],
})

let totalCommented = 0
let filesModified = 0

files.forEach((file) => {
  let content = fs.readFileSync(file, 'utf8')
  let modified = false
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check if line contains uncommented logger usage
    if (line.includes('logger.') && !line.trim().startsWith('//') && !line.includes('LOGGER_REMOVED')) {
      // Check if it's inside a comment block
      let insideComment = false
      for (let j = Math.max(0, i - 5); j < i; j++) {
        if (lines[j].includes('/*') && !lines[j].includes('*/')) {
          insideComment = true
        }
        if (lines[j].includes('*/')) {
          insideComment = false
        }
      }

      if (!insideComment) {
        // Comment out the line
        lines[i] = line.replace(/^(\s*)/, '$1// LOGGER_REMOVED: ')
        modified = true
        totalCommented++
        console.log(`  Commented line ${i + 1} in ${file}`)
      }
    }
  }

  if (modified) {
    content = lines.join('\n')
    fs.writeFileSync(file, content)
    filesModified++
    console.log(`Modified: ${file}`)
  }
})

console.log(`\n✅ Commented ${totalCommented} logger lines in ${filesModified} files`)
