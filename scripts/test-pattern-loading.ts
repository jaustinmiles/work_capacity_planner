import { getCurrentTime, setTimeOverride } from '../src/shared/time-provider'
import { getDatabase } from '../src/renderer/services/database'
import dayjs from 'dayjs'

async function testPatternLoading() {
  console.log('=== Testing Pattern Loading with Override ===')

  // Test 1: Without override (real time)
  console.log('\n1. Real time patterns:')
  console.log(`  Current real time: ${new Date().toISOString()}`)
  const realToday = dayjs().startOf('day')
  for (let i = 0; i < 7; i++) {
    const date = realToday.add(i, 'day').format('YYYY-MM-DD')
    const pattern = await getDatabase().getWorkPattern(date)
    console.log(`  ${date}: ${pattern?.blocks?.length || 0} blocks, ${pattern?.meetings?.length || 0} meetings`)
  }

  // Test 2: With Sep 13 9pm PST override
  const overrideTime = new Date('2025-09-13T21:00:00-07:00')
  setTimeOverride(overrideTime)
  console.log('\n2. Override time patterns (Sep 13 9pm PST):')
  console.log(`  Override set to: ${overrideTime.toISOString()}`)
  console.log(`  getCurrentTime returns: ${getCurrentTime().toISOString()}`)

  const overrideToday = dayjs(getCurrentTime()).startOf('day')
  console.log(`  Override day start: ${overrideToday.format('YYYY-MM-DD')}`)

  // Test loading range with -1 to 8 (like fixed loadWorkPatterns)
  console.log('\n3. Loading patterns with -1 to 8 range:')
  for (let i = -1; i < 8; i++) {
    const date = overrideToday.add(i, 'day').format('YYYY-MM-DD')
    const pattern = await getDatabase().getWorkPattern(date)
    const blocks = pattern?.blocks?.length || 0
    const meetings = pattern?.meetings?.length || 0

    if (blocks > 0 || meetings > 0) {
      console.log(`  ${date}: ${blocks} blocks, ${meetings} meetings ✓`)
    } else {
      console.log(`  ${date}: ${blocks} blocks, ${meetings} meetings`)
    }
  }

  // Test 3: Verify Sep 13 blocks exist and details
  console.log('\n4. Sep 13 blocks detail:')
  const sep13Pattern = await getDatabase().getWorkPattern('2025-09-13')
  if (sep13Pattern?.blocks && sep13Pattern.blocks.length > 0) {
    console.log(`  Found ${sep13Pattern.blocks.length} blocks:`)
    sep13Pattern.blocks.forEach((b: any) => {
      const capacity = b.capacity || {}
      const totalMinutes = (capacity.focusMinutes || 0) + (capacity.adminMinutes || 0) + (capacity.personalMinutes || 0)
      console.log(`    ${b.startTime}-${b.endTime}: ${b.type} block (${totalMinutes} min capacity)`)
    })
  } else {
    console.log('  ❌ No blocks found for Sep 13!')
  }

  // Test 4: Check if pattern dates would include override date
  console.log('\n5. Pattern loading validation:')
  const _overrideDateStr = overrideToday.format('YYYY-MM-DD')
  const _wouldLoadOverrideDate = false

  for (let i = -1; i < 8; i++) {
    const date = overrideToday.add(i, 'day').format('YYYY-MM-DD')
    if (date === '2025-09-13') {
      console.log(`  ✓ Sep 13 would be loaded (at index ${i})`)
      break
    }
  }

  // Clear override
  setTimeOverride(null)
  console.log('\n6. Override cleared')
  console.log(`  getCurrentTime now returns: ${getCurrentTime().toISOString()}`)
}

// Run the test
testPatternLoading().catch(console.error)
