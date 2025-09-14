#!/usr/bin/env npx tsx
import { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import { getCurrentTime } from '../../src/shared/time-provider'

const prisma = new PrismaClient()

async function main() {
  console.log('=' .repeat(80))
  console.log('VERIFY WORK BLOCK PROPERTY NAMES')
  console.log('=' .repeat(80))

  const dateStr = dayjs(getCurrentTime()).format('YYYY-MM-DD')

  // Get work pattern from database
  const pattern = await prisma.workPattern.findFirst({
    where: { date: dateStr },
    include: { WorkBlock: true },
  })

  if (!pattern) {
    console.log('No pattern found for', dateStr)
    return
  }

  console.log('\n📦 WORK BLOCKS FROM DATABASE:')
  pattern.WorkBlock.forEach(block => {
    console.log('\nBlock properties:')
    Object.keys(block).forEach(key => {
      console.log(`  ${key}: ${(block as any)[key]}`)
    })
  })

  console.log('\n🔍 KEY FINDING:')
  const block = pattern.WorkBlock[0]
  console.log(`  Database has: startTime="${block.startTime}", endTime="${block.endTime}"`)

  console.log('\n📊 What scheduler expects vs what adapter provides:')
  console.log('  UnifiedScheduler expects: block.startTime and block.endTime')
  console.log('  UnifiedSchedulerAdapter provides work patterns with blocks having:')
  console.log('    - "start" and "end" (from DailyWorkPattern type)')
  console.log('    OR')
  console.log('    - "startTime" and "endTime" (from database)')

  console.log('\n❌ THE BUG:')
  console.log('  The adapter creates blocks with "start" and "end"')
  console.log('  But UnifiedScheduler tries to read "startTime" and "endTime"')
  console.log('  Result: undefined.split(":") crashes!')
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
