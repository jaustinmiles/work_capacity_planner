#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// Get database path
const dbPath = path.join(__dirname, '..', 'prisma', 'dev.db')
const backupDir = path.join(__dirname, '..', 'backups')

// Create backups directory if it doesn't exist
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true })
}

// Check if database exists
if (!fs.existsSync(dbPath)) {
  console.error('❌ Database file not found at:', dbPath)
  process.exit(1)
}

// Create timestamp for backup name
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5)
const backupName = `backup_${timestamp}.db`
const backupPath = path.join(backupDir, backupName)

try {
  // Copy database file
  fs.copyFileSync(dbPath, backupPath)

  // Also backup the WAL file if it exists
  const walPath = `${dbPath}-wal`
  const walBackupPath = `${backupPath}-wal`
  if (fs.existsSync(walPath)) {
    fs.copyFileSync(walPath, walBackupPath)
  }

  // Also backup the SHM file if it exists
  const shmPath = `${dbPath}-shm`
  const shmBackupPath = `${backupPath}-shm`
  if (fs.existsSync(shmPath)) {
    fs.copyFileSync(shmPath, shmBackupPath)
  }

  console.log('✅ Database backed up successfully!')
  console.log('📁 Backup location:', backupPath)

  // List recent backups
  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
    .sort()
    .slice(-5)

  console.log('\n📚 Recent backups:')
  backups.forEach(backup => {
    const stats = fs.statSync(path.join(backupDir, backup))
    const size = (stats.size / 1024 / 1024).toFixed(2)
    console.log(`  - ${backup} (${size} MB)`)
  })

} catch (error) {
  console.error('❌ Backup failed:', error.message)
  process.exit(1)
}
