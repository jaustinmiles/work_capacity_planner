#!/usr/bin/env node

/**
 * Script to clean up duplicate Default Sessions
 * Run with: node scripts/cleanup-duplicate-sessions.js
 */

const { PrismaClient } = require('@prisma/client')
const path = require('path')

async function cleanupDuplicateSessions() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${path.join(__dirname, '..', 'dev.db')}`,
      },
    },
  })

  try {
    console.log('🔍 Finding duplicate sessions...')
    
    // Find all Default Sessions
    const defaultSessions = await prisma.session.findMany({
      where: {
        name: 'Default Session',
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    console.log(`Found ${defaultSessions.length} Default Sessions`)

    if (defaultSessions.length > 1) {
      // Keep the first one (oldest) and delete the rest
      const toKeep = defaultSessions[0]
      const toDelete = defaultSessions.slice(1)

      console.log(`Keeping session: ${toKeep.id} (created: ${toKeep.createdAt})`)
      console.log(`Deleting ${toDelete.length} duplicate sessions...`)

      // Check if any of the duplicates have associated data
      for (const session of toDelete) {
        const taskCount = await prisma.task.count({
          where: { sessionId: session.id },
        })
        const workflowCount = await prisma.workflow.count({
          where: { sessionId: session.id },
        })
        
        if (taskCount > 0 || workflowCount > 0) {
          console.log(`⚠️  Session ${session.id} has ${taskCount} tasks and ${workflowCount} workflows`)
          console.log(`   Migrating data to the primary session...`)
          
          // Migrate tasks
          await prisma.task.updateMany({
            where: { sessionId: session.id },
            data: { sessionId: toKeep.id },
          })
          
          // Migrate workflows
          await prisma.workflow.updateMany({
            where: { sessionId: session.id },
            data: { sessionId: toKeep.id },
          })
        }

        // Delete the duplicate session
        await prisma.session.delete({
          where: { id: session.id },
        })
        console.log(`✅ Deleted session ${session.id}`)
      }

      // Ensure the kept session is active
      await prisma.session.update({
        where: { id: toKeep.id },
        data: { isActive: true },
      })

      console.log('✨ Cleanup complete!')
    } else if (defaultSessions.length === 1) {
      console.log('✅ Only one Default Session found, no cleanup needed')
      
      // Ensure it's active
      await prisma.session.update({
        where: { id: defaultSessions[0].id },
        data: { isActive: true },
      })
    } else {
      console.log('ℹ️  No Default Sessions found')
    }

    // Show final state
    const allSessions = await prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
    })
    
    console.log('\n📊 Final session state:')
    for (const session of allSessions) {
      const taskCount = await prisma.task.count({
        where: { sessionId: session.id },
      })
      const workflowCount = await prisma.workflow.count({
        where: { sessionId: session.id },
      })
      
      console.log(`  - ${session.name} (${session.isActive ? '✓ Active' : 'Inactive'}): ${taskCount} tasks, ${workflowCount} workflows`)
    }

  } catch (error) {
    console.error('❌ Error during cleanup:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the cleanup
cleanupDuplicateSessions()