#!/usr/bin/env npx tsx
/**
 * Trace capacity calculation through all code paths
 * This helps identify why capacity shows as 57 minutes instead of full duration
 */

import { PrismaClient } from '@prisma/client'
import { getTotalCapacity, getBlockCapacity as getBlockCapacityFromTypes } from '../src/shared/work-blocks-types'
import { calculateDuration } from '../src/shared/time-utils'

const prisma = new PrismaClient()

// Simulate WorkStatusWidget's getBlockCapacity
function getBlockCapacityWidget(block: any) {
  const duration = calculateDuration(block.startTime, block.endTime)

  if (block.capacity) {
    console.log('  📦 Block has explicit capacity:', block.capacity)
    return {
      focusMinutes: block.capacity.focusMinutes || 0,
      adminMinutes: block.capacity.adminMinutes || 0,
    }
  } else if (block.type === 'focused') {
    return { focusMinutes: duration, adminMinutes: 0 }
  } else if (block.type === 'admin') {
    return { focusMinutes: 0, adminMinutes: duration }
  } else if (block.type === 'mixed') {
    console.log('  🔄 Mixed block - splitting duration:', duration / 2, 'each')
    return { focusMinutes: duration / 2, adminMinutes: duration / 2 }
  } else {
    // flexible and universal blocks - full duration available for either type
    console.log('  ✅ Flexible/Universal block - FULL duration for both:', duration)
    return { focusMinutes: duration, adminMinutes: duration }
  }
}

async function main() {
  console.log('=' .repeat(80))
  console.log('CAPACITY CALCULATION TRACE')
  console.log('=' .repeat(80))

  // Get pattern for Sep 14
  const pattern = await prisma.workPattern.findFirst({
    where: { date: '2025-09-14' },
    include: { WorkBlock: true }
  })

  if (!pattern) {
    console.error('❌ No pattern found for 2025-09-14')
    return
  }

  console.log('\n📅 Pattern for Sep 14:')
  console.log('  Blocks:', pattern.WorkBlock.length)

  for (const block of pattern.WorkBlock) {
    console.log('\n📦 Block Details:')
    console.log('  Time:', block.startTime, '-', block.endTime)
    console.log('  Type:', block.type)
    console.log('  Capacity from DB:', block.capacity)

    const duration = calculateDuration(block.startTime, block.endTime)
    console.log('  Calculated Duration:', duration, 'minutes')

    // Test different calculation methods
    console.log('\n🧮 Method 1: getTotalCapacity from work-blocks-types')
    const totalCapacity = getTotalCapacity([block as any])
    console.log('  Result:', totalCapacity)

    console.log('\n🧮 Method 2: WorkStatusWidget.getBlockCapacity simulation')
    const widgetCapacity = getBlockCapacityWidget(block)
    console.log('  Result:', widgetCapacity)

    console.log('\n🧮 Method 3: Old calculation (for comparison)')
    if (block.type === 'flexible' || block.type === 'universal') {
      console.log('  OLD: Would split by 2:', duration / 2, 'each')
      console.log('  NEW: Should use full:', duration, 'each')
    }

    // Check for accumulated time
    console.log('\n⏱️ Checking for accumulated time that might reduce capacity:')
    const accumulated = await prisma.workSession.findMany({
      where: {
        startTime: {
          gte: new Date('2025-09-14T00:00:00'),
          lt: new Date('2025-09-15T00:00:00')
        }
      }
    })

    const totalAccumulated = accumulated.reduce((sum, s) => {
      if (s.endTime) {
        return sum + Math.floor((s.endTime.getTime() - s.startTime.getTime()) / 60000)
      }
      return sum
    }, 0)

    console.log('  Work sessions today:', accumulated.length)
    console.log('  Total accumulated minutes:', totalAccumulated)

    if (totalAccumulated > 0) {
      const focusRemaining = Math.max(0, totalCapacity.focusMinutes - totalAccumulated)
      const adminRemaining = Math.max(0, totalCapacity.adminMinutes - totalAccumulated)
      console.log('  Remaining after accumulated:')
      console.log('    Focus:', focusRemaining, 'minutes')
      console.log('    Admin:', adminRemaining, 'minutes')

      if (focusRemaining === 57 || adminRemaining === 57) {
        console.log('  🎯 FOUND IT! 57 minutes is the remaining capacity after accumulated time!')
      }
    }
  }

    console.log('\n' + '=' .repeat(80))
    console.log('DIAGNOSIS:')
    if (totalCapacity.focusMinutes === 57) {
      console.log('❌ getTotalCapacity is returning 57 - the fix is not applied!')
    } else if (widgetCapacity.focusMinutes === 57) {
      console.log('❌ WorkStatusWidget calculation is returning 57 - widget code not updated!')
    } else {
      console.log('✅ Calculation methods return correct values (895 minutes)')
      console.log('🤔 The 57 minutes in logs might be coming from:')
      console.log('  - Old cached values before the fix')
      console.log('  - A different code path we haven\'t found')
      console.log('  - The app needs a full restart to load new code')
    }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })