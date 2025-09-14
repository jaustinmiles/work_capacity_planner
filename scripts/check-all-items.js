const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const session = await prisma.session.findFirst({
    where: { isActive: true },
  })

  // Get all incomplete tasks AND workflows
  const tasks = await prisma.task.findMany({
    where: {
      sessionId: session.id,
      completed: false,
    },
  })

  const workflows = await prisma.sequencedTask.findMany({
    where: {
      sessionId: session.id,
      overallStatus: { not: 'completed' },
    },
    include: {
      TaskStep: true,
    },
  })

  let totalFocus = 0, totalAdmin = 0, totalPersonal = 0

  console.log('TASKS:')
  tasks.forEach(t => {
    console.log(`  ${t.name}: ${t.type}, ${t.duration} min`)
    if (t.type === 'focused') totalFocus += t.duration
    else if (t.type === 'admin') totalAdmin += t.duration
    else if (t.type === 'personal') totalPersonal += t.duration
  })

  console.log('\nWORKFLOWS with steps:')
  workflows.forEach(w => {
    console.log(`  ${w.name}:`)
    w.TaskStep.forEach(s => {
      console.log(`    - ${s.name}: ${s.type}, ${s.duration} min`)
      if (s.type === 'focused') totalFocus += s.duration
      else if (s.type === 'admin') totalAdmin += s.duration
      else if (s.type === 'personal') totalPersonal += s.duration
    })
  })

  console.log('\nTOTALS:')
  console.log('  Focus:', totalFocus, 'min')
  console.log('  Admin:', totalAdmin, 'min')
  console.log('  Personal:', totalPersonal, 'min')
  console.log('  GRAND TOTAL:', totalFocus + totalAdmin + totalPersonal, 'min')
}

main().then(() => process.exit(0))
