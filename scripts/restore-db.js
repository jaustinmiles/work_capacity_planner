#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const question = (query) => new Promise((resolve) => rl.question(query, resolve))

async function main() {
  const dbPath = path.join(__dirname, '..', 'prisma', 'dev.db')
  const backupDir = path.join(__dirname, '..', 'backups')
  
  // List available backups
  if (!fs.existsSync(backupDir)) {
    console.error('❌ No backups directory found')
    process.exit(1)
  }
  
  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
    .sort()
    .reverse() // Most recent first
  
  if (backups.length === 0) {
    console.error('❌ No backups found')
    process.exit(1)
  }
  
  console.log('📚 Available backups:\n')
  backups.forEach((backup, index) => {
    const backupPath = path.join(backupDir, backup)
    const stats = fs.statSync(backupPath)
    const size = (stats.size / 1024 / 1024).toFixed(2)
    const date = stats.mtime.toLocaleString()
    console.log(`${index + 1}. ${backup}`)
    console.log(`   Size: ${size} MB | Modified: ${date}\n`)
  })
  
  const choice = await question('Enter backup number to restore (or q to quit): ')
  
  if (choice.toLowerCase() === 'q') {
    console.log('👋 Restore cancelled')
    process.exit(0)
  }
  
  const backupIndex = parseInt(choice) - 1
  if (isNaN(backupIndex) || backupIndex < 0 || backupIndex >= backups.length) {
    console.error('❌ Invalid selection')
    process.exit(1)
  }
  
  const selectedBackup = backups[backupIndex]
  const backupPath = path.join(backupDir, selectedBackup)
  
  console.log(`\n⚠️  This will replace the current database with: ${selectedBackup}`)
  const confirm = await question('Are you sure? (yes/no): ')
  
  if (confirm.toLowerCase() !== 'yes') {
    console.log('👋 Restore cancelled')
    process.exit(0)
  }
  
  try {
    // Backup current database before restoring
    if (fs.existsSync(dbPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5)
      const preRestoreBackup = path.join(backupDir, `pre-restore_${timestamp}.db`)
      fs.copyFileSync(dbPath, preRestoreBackup)
      console.log(`📸 Current database backed up to: pre-restore_${timestamp}.db`)
    }
    
    // Restore the selected backup
    fs.copyFileSync(backupPath, dbPath)
    
    // Also restore WAL and SHM files if they exist
    const walBackupPath = `${backupPath}-wal`
    const walPath = `${dbPath}-wal`
    if (fs.existsSync(walBackupPath)) {
      fs.copyFileSync(walBackupPath, walPath)
    } else if (fs.existsSync(walPath)) {
      // Remove existing WAL if backup doesn't have one
      fs.unlinkSync(walPath)
    }
    
    const shmBackupPath = `${backupPath}-shm`
    const shmPath = `${dbPath}-shm`
    if (fs.existsSync(shmBackupPath)) {
      fs.copyFileSync(shmBackupPath, shmPath)
    } else if (fs.existsSync(shmPath)) {
      // Remove existing SHM if backup doesn't have one
      fs.unlinkSync(shmPath)
    }
    
    console.log('✅ Database restored successfully!')
    console.log('🔄 Please restart the application for changes to take effect.')
    
  } catch (error) {
    console.error('❌ Restore failed:', error.message)
    process.exit(1)
  }
  
  rl.close()
}

main().catch(console.error)