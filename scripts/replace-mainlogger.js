#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const glob = require('glob')

// Find all TypeScript files
const files = glob.sync('src/**/*.{ts,tsx}', {
  ignore: ['**/node_modules/**', '**/dist/**', 'src/logger/**'],
})

let totalReplaced = 0
let filesModified = 0

files.forEach((file) => {
  let content = fs.readFileSync(file, 'utf8')
  let modified = false

  // Replace mainLogger references
  const patterns = [
    // Replace mainLogger.info/warn/error/debug/trace with logger.server.info/warn/error/debug/trace
    /mainLogger\.(info|warn|error|debug|trace)\(/g,
    // Replace this.logger references with logger.db (for database)
    /this\.logger\.(info|warn|error|debug|trace)\(/g,
    // Replace mainLogger.child references
    /mainLogger\.child\(/g,
    // Replace mainLogger.setPrisma
    /mainLogger\.setPrisma\([^)]*\)/g,
  ]

  // Replace mainLogger calls with appropriate scoped logger
  content = content.replace(/mainLogger\.(info|warn|error|debug|trace)\(/g, (match, method) => {
    totalReplaced++
    modified = true
    // For main process files, use server scope
    if (file.includes('/main/')) {
      return `logger.server.${method}(`
    }
    // For database files, use db scope
    if (file.includes('database')) {
      return `logger.db.${method}(`
    }
    return `logger.system.${method}(`
  })

  // Replace this.logger calls in database.ts
  content = content.replace(/this\.logger\.(info|warn|error|debug|trace)\(/g, (match, method) => {
    totalReplaced++
    modified = true
    return `logger.db.${method}(`
  })

  // Remove mainLogger.child calls
  content = content.replace(/mainLogger\.child\([^)]*\)/g, () => {
    totalReplaced++
    modified = true
    return 'logger.db'
  })

  // Remove mainLogger.setPrisma calls
  content = content.replace(/mainLogger\.setPrisma\([^)]*\);?\n?/g, () => {
    totalReplaced++
    modified = true
    return ''
  })

  // Replace standalone mainLogger with logger
  content = content.replace(/\bmainLogger\b/g, 'logger')

  if (modified) {
    fs.writeFileSync(file, content)
    filesModified++
    console.log(`Modified: ${file}`)
  }
})

console.log(`\n✅ Replaced ${totalReplaced} mainLogger references in ${filesModified} files`)
