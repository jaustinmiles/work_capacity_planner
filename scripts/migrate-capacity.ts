#!/usr/bin/env npx tsx
/**
 * Migration script to convert work blocks to unified capacity system
 * Preserves Sun Sep 21 session data while clearing test data
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function calculateTotalMinutes(startTime: string, endTime: string): number {
  const [startHour, startMin] = startTime.split(':').map(Number)
  const [endHour, endMin] = endTime.split(':').map(Number)
  return (endHour * 60 + endMin) - (startHour * 60 + startMin)
}

async function main() {
  console.log('Starting capacity migration...')

  try {
    // Get all work blocks
    const blocks = await prisma.workBlock.findMany({
      include: {
        WorkPattern: {
          include: {
            Session: true,
          },
        },
      },
    })

    console.log(`Found ${blocks.length} work blocks to migrate`)

    // Update each block
    for (const block of blocks) {
      const totalMinutes = calculateTotalMinutes(block.startTime, block.endTime)

      // Determine split ratio for mixed blocks
      let splitRatio = null
      if (block.type === 'mixed') {
        // Try to preserve existing split if available
        if ((block as any).focusCapacity && (block as any).adminCapacity) {
          const total = (block as any).focusCapacity + (block as any).adminCapacity
          splitRatio = JSON.stringify({
            focus: (block as any).focusCapacity / total,
            admin: (block as any).adminCapacity / total,
          })
        } else {
          // Default 70/30 split for mixed blocks
          splitRatio = JSON.stringify({ focus: 0.7, admin: 0.3 })
        }
      }

      // Update block with new capacity system
      await prisma.workBlock.update({
        where: { id: block.id },
        data: {
          totalCapacity: totalMinutes,
          splitRatio: splitRatio,
        },
      })

      console.log(`Updated block ${block.id}: ${block.type} - ${totalMinutes} minutes`)
    }

    // Clean up test data (keep only Sun Sep 21 session)
    const sessionsToKeep = await prisma.session.findMany({
      where: {
        name: {
          contains: 'Sun Sep 21',
        },
      },
    })

    if (sessionsToKeep.length > 0) {
      console.log(`Keeping session: ${sessionsToKeep[0].name}`)

      // Delete all other sessions
      await prisma.session.deleteMany({
        where: {
          id: {
            notIn: sessionsToKeep.map(s => s.id),
          },
        },
      })
    }

    console.log('Migration completed successfully!')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
