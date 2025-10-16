#!/usr/bin/env node

const fs = require('fs')
const glob = require('glob')

// Find all TypeScript files
const files = glob.sync('src/**/*.{ts,tsx}', {
  ignore: ['**/node_modules/**', '**/dist/**'],
})

let totalCommented = 0
let filesModified = 0

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8')
  let modified = false

  // Comment out import statements for logger
  const importPatterns = [
    /^import.*from\s+['"].*\/logging.*['"];?$/gm,
    /^import.*from\s+['"]@\/shared\/logger['"];?$/gm,
    /^import\s+\{\s*logger\s*\}.*$/gm,
    /^import\s+\{\s*getLogger.*\}.*$/gm,
    /^import\s+\{\s*useLoggerContext\s*\}.*$/gm,
    /^import\s+\{\s*LoggerProvider\s*\}.*$/gm,
    /^const\s+logger\s*=.*getLogger\(\).*$/gm,
  ]

  importPatterns.forEach(pattern => {
    if (pattern.test(content)) {
      content = content.replace(pattern, (match) => {
        totalCommented++
        modified = true
        return `// LOGGER_REMOVED: ${match}`
      })
    }
  })

  // Comment out logger usage (but be careful not to break syntax)
  const usagePatterns = [
    // Match logger.something(...) calls
    /^(\s*)(logger\.\w+\([^)]*\));?$/gm,
    // Match logger.ui.something(...) or similar nested calls
    /^(\s*)(logger\.\w+\.\w+\([^)]*\));?$/gm,
    // Match loggerContext usage
    /^(\s*)(loggerContext\.\w+.*);?$/gm,
    // Match getLogger() calls
    /^(\s*)(const\s+\w+\s*=\s*getLogger\(\).*);?$/gm,
  ]

  usagePatterns.forEach(pattern => {
    content = content.replace(pattern, (match, indent, code) => {
      totalCommented++
      modified = true
      return `${indent}// LOGGER_REMOVED: ${code}`
    })
  })

  // Special case: Remove LoggerProvider wrapping in JSX
  content = content.replace(
    /<LoggerProvider[^>]*>[\s\S]*?<\/LoggerProvider>/g,
    (match) => {
      // Extract the children content
      const childMatch = match.match(/<LoggerProvider[^>]*>([\s\S]*?)<\/LoggerProvider>/)
      if (childMatch && childMatch[1]) {
        modified = true
        totalCommented++
        return `{/* LOGGER_REMOVED: LoggerProvider */}\n${childMatch[1]}`
      }
      return match
    },
  )

  if (modified) {
    fs.writeFileSync(file, content)
    filesModified++
    console.log(`Modified: ${file}`)
  }
})

console.log(`\n✅ Commented out ${totalCommented} logger references in ${filesModified} files`)
