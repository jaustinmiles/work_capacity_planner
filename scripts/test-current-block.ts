#!/usr/bin/env npx tsx
/**
 * Script to test getCurrentBlock function with actual data
 */

import { getCurrentBlock, getNextBlock } from '../src/shared/work-blocks-types'

const testBlocks = [
  {
    id: '7f77229a-f0b1-4e5f-9747-fcfc6b4efb51',
    patternId: '7ed6eaa1-f1eb-4d3c-ad27-9e41decb6142',
    startTime: '09:00',
    endTime: '23:55',
    type: 'flexible' as const,
    capacity: {
      focusMinutes: 447,
      adminMinutes: 447,
    },
  },
]

function main() {
  const now = new Date()
  const timeStr = now.toTimeString().slice(0, 5)

  console.log('='.repeat(80))
  console.log('CURRENT BLOCK TEST')
  console.log('='.repeat(80))

  // [WorkPatternLifeCycle] Test current block detection
  console.log('\n[WorkPatternLifeCycle] test-current-block - START:', {
    currentTime: timeStr,
    currentTimeISO: now.toISOString(),
    localTime: now.toLocaleTimeString('en-US', { hour12: false }),
    testBlocks: testBlocks.map(b => ({
      startTime: b.startTime,
      endTime: b.endTime,
      type: b.type,
    })),
    timestamp: new Date().toISOString(),
  })

  console.log(`\nCurrent time: ${timeStr} (${now.toLocaleTimeString()})`)
  console.log('Test block: 09:00 to 23:55 (flexible)')

  // Test with current time
  const currentBlock = getCurrentBlock(testBlocks, now)

  console.log('\n📍 getCurrentBlock result:')
  if (currentBlock) {
    console.log('  ✅ FOUND current block:')
    console.log(`    Start: ${currentBlock.startTime}`)
    console.log(`    End: ${currentBlock.endTime}`)
    console.log(`    Type: ${currentBlock.type}`)
    console.log(`    Capacity: ${JSON.stringify(currentBlock.capacity)}`)
  } else {
    console.log('  ❌ NO current block found')
  }

  // Test next block
  const nextBlock = getNextBlock(testBlocks, now)

  console.log('\n⏭️ getNextBlock result:')
  if (nextBlock) {
    console.log('  Found next block:')
    console.log(`    Start: ${nextBlock.startTime}`)
    console.log(`    End: ${nextBlock.endTime}`)
    console.log(`    Type: ${nextBlock.type}`)
  } else {
    console.log('  No next block found')
  }

  // Manual verification
  console.log('\n🔍 Manual time comparison:')
  console.log(`  Current time: ${timeStr}`)
  console.log('  Block start: 09:00')
  console.log('  Block end: 23:55')
  console.log(`  Is ${timeStr} >= 09:00? ${timeStr >= '09:00'}`)
  console.log(`  Is ${timeStr} < 23:55? ${timeStr < '23:55'}`)
  console.log(`  Should be in block: ${timeStr >= '09:00' && timeStr < '23:55'}`)

  // Test with different times
  console.log('\n🧪 Testing different times:')
  const testTimes = ['08:00', '09:00', '09:01', '12:00', '18:49', '23:54', '23:55', '23:56']

  testTimes.forEach(testTime => {
    const [hour, min] = testTime.split(':').map(Number)
    const testDate = new Date()
    testDate.setHours(hour, min, 0, 0)

    const result = getCurrentBlock(testBlocks, testDate)
    console.log(`  ${testTime}: ${result ? '✅ IN BLOCK' : '❌ NOT IN BLOCK'}`)
  })

  // [WorkPatternLifeCycle] Log completion
  console.log('\n[WorkPatternLifeCycle] test-current-block - COMPLETE:', {
    currentTime: timeStr,
    currentBlockFound: !!currentBlock,
    expectedInBlock: timeStr >= '09:00' && timeStr < '23:55',
    matchesExpectation: !!currentBlock === (timeStr >= '09:00' && timeStr < '23:55'),
    timestamp: new Date().toISOString(),
  })
}

main()
