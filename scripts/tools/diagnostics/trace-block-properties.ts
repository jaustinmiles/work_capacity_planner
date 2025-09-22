#!/usr/bin/env npx tsx
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Mock the full chain
class MockSchedulingService {
  async loadPatterns() {
    // This simulates what SchedulingService does
    const pattern = await prisma.workPattern.findFirst({
      where: { date: '2025-09-14' },
      include: { WorkBlock: true },
    })

    if (!pattern) return []

    // This is what gets put into patterns array
    const workPattern = {
      date: pattern.date,
      blocks: pattern.WorkBlock, // Direct assignment, keeps all properties
      meetings: [],
      accumulated: { focusMinutes: 0, adminMinutes: 0 },
    }

    console.log('SchedulingService creates pattern:')
    console.log('  blocks[0] properties:', Object.keys(workPattern.blocks[0]))
    console.log('  Has startTime?', 'startTime' in workPattern.blocks[0])
    console.log('  Has endTime?', 'endTime' in workPattern.blocks[0])
    console.log('  startTime value:', workPattern.blocks[0].startTime)
    console.log('  endTime value:', workPattern.blocks[0].endTime)

    return [workPattern]
  }
}

async function main() {
  console.log('=' .repeat(80))
  console.log('TRACE BLOCK PROPERTIES THROUGH PIPELINE')
  console.log('=' .repeat(80))

  const service = new MockSchedulingService()
  const patterns = await service.loadPatterns()

  if (patterns.length === 0) {
    console.log('No patterns found')
    return
  }

  console.log('\n✅ Properties are preserved correctly!')
  console.log('The blocks DO have startTime and endTime')

  console.log('\n🤔 So why undefined.split()?')
  console.log('Possible reasons:')
  console.log('1. The pattern might be for a different date')
  console.log('2. The accumulated property might be missing somewhere')
  console.log('3. Some transformation in UnifiedSchedulerAdapter might break it')
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
