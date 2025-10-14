#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

// Recursively delete a directory
function deleteDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`Directory ${dirPath} does not exist`)
    return
  }

  const files = fs.readdirSync(dirPath)

  for (const file of files) {
    const filePath = path.join(dirPath, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      deleteDirectory(filePath)
    } else {
      fs.unlinkSync(filePath)
      console.log(`Deleted: ${filePath}`)
    }
  }

  fs.rmdirSync(dirPath)
  console.log(`Deleted directory: ${dirPath}`)
}

// Delete the old logging directory
const loggingPath = path.join(__dirname, '..', 'src', 'logging')
console.log('Removing old logging system...')
deleteDirectory(loggingPath)

// Also delete shared/logger.ts which imports from old system
const sharedLoggerPath = path.join(__dirname, '..', 'src', 'shared', 'logger.ts')
if (fs.existsSync(sharedLoggerPath)) {
  fs.unlinkSync(sharedLoggerPath)
  console.log(`Deleted: ${sharedLoggerPath}`)
}

console.log('✅ Old logging system removed')
