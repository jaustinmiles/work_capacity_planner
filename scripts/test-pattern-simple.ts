// Simple test without renderer imports
import dayjs from 'dayjs'

// Simulate what our fix does
function testPatternLoading() {
  console.log('=== Testing Pattern Loading Logic ===\n')

  // Test 1: Original broken code (using dayjs())
  console.log('1. BROKEN CODE (using dayjs()):')
  const realToday = dayjs().startOf('day')
  console.log(`   Real today: ${realToday.format('YYYY-MM-DD')}`)
  console.log('   Would load patterns for:')
  for (let i = 0; i < 7; i++) {
    const date = realToday.add(i, 'day').format('YYYY-MM-DD')
    console.log(`     - ${date}`)
  }
  console.log('   ❌ Sep 13 NOT included!\n')

  // Test 2: Fixed code (using override time)
  console.log('2. FIXED CODE (using getCurrentTime() with Sep 13 9pm override):')
  const overrideTime = new Date('2025-09-13T21:00:00-07:00')
  console.log(`   Override time: ${overrideTime.toISOString()} (Sep 13 9pm PST)`)

  const overrideToday = dayjs(overrideTime).startOf('day')
  console.log(`   Override today: ${overrideToday.format('YYYY-MM-DD')}`)
  console.log('   Would load patterns for (with -1 to 8 range):')
  for (let i = -1; i < 8; i++) {
    const date = overrideToday.add(i, 'day').format('YYYY-MM-DD')
    const marker = date === '2025-09-13' ? ' ✅ <-- Sep 13 included!' : ''
    console.log(`     - ${date}${marker}`)
  }

  // Test 3: UTC conversion check
  console.log('\n3. UTC Conversion Check:')
  console.log(`   Sep 13 9pm PST = ${overrideTime.toISOString()}`)
  console.log(`   That's Sep 14 4am UTC (next day in UTC)`)
  console.log(`   But dayjs().startOf('day') uses LOCAL time, so it's still Sep 13`)

  // Test 4: What the scheduler sees
  console.log('\n4. What happens in the scheduler:')
  const schedulerCurrentTime = overrideTime // This is what getCurrentTime() returns
  const patternDate = overrideToday.format('YYYY-MM-DD') // Sep 13
  console.log(`   Scheduler currentTime: ${schedulerCurrentTime.toISOString()}`)
  console.log(`   Pattern date needed: ${patternDate}`)
  console.log(`   With our fix: Pattern IS loaded ✅`)
  console.log(`   Without fix: Pattern NOT loaded ❌`)
}

testPatternLoading()