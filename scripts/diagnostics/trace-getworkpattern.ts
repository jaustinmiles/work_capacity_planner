#!/usr/bin/env npx tsx
import { PrismaClient } from '@prisma/client'
import { SchedulingService } from '../../src/shared/scheduling-service'

const prisma = new PrismaClient()

// Create the getWorkPattern function that SchedulingService uses
const getWorkPattern = async (date: string) => {
  const pattern = await prisma.workPattern.findFirst({
    where: { date },
    include: { WorkBlock: true },
  })
  if (!pattern) return null

  // This is what the scheduling service passes to the database interface
  const result = {
    date: pattern.date,
    blocks: pattern.WorkBlock.map(b => ({
      id: b.id,
      type: b.type,
      startTime: b.startTime,
      endTime: b.endTime,
      capacity: b.capacity,
    })),
    meetings: [],
  }

  console.log('getWorkPattern returns:')
  console.log(JSON.stringify(result, null, 2))

  return result
}

async function main() {
  console.log('=' .repeat(80))
  console.log('TRACE getWorkPattern RETURN VALUE')
  console.log('=' .repeat(80))

  await getWorkPattern('2025-09-14')
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
