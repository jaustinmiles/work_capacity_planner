#!/usr/bin/env npx tsx
/**
 * Manual test script to verify dependency wiring in split functionality
 * This creates test data with dependencies and verifies they're preserved
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function testDependencyWiring() {
  console.log('🧪 Testing dependency wiring in split functionality...\n')

  try {
    // Get or create a test session
    const session = await prisma.session.findFirst({
      where: { name: 'Test Session' },
    }) || await prisma.session.create({
      data: {
        id: 'test-session-' + Date.now(),
        name: 'Test Session',
        isActive: true,
        description: 'Session for testing dependency wiring in splits',
      },
    })

    console.log('📝 Creating test tasks with dependencies...')

    // Clean up existing test data first
    await prisma.taskStep.deleteMany({
      where: {
        taskId: { in: ['workflow-with-deps'] },
      },
    })
    await prisma.task.deleteMany({
      where: {
        id: { in: ['prereq-task-1', 'prereq-task-2', 'main-task-with-deps', 'workflow-with-deps'] },
      },
    })

    // Create prerequisite tasks
    const task1 = await prisma.task.create({
      data: {
        id: 'prereq-task-1',
        name: 'Prerequisite Task 1',
        duration: 60,
        importance: 5,
        urgency: 5,
        type: 'focused',
        sessionId: session.id,
        updatedAt: new Date(),
      },
    })

    const task2 = await prisma.task.create({
      data: {
        id: 'prereq-task-2',
        name: 'Prerequisite Task 2',
        duration: 45,
        importance: 4,
        urgency: 6,
        type: 'focused',
        sessionId: session.id,
        updatedAt: new Date(),
      },
    })

    // Create main task with dependencies
    const mainTask = await prisma.task.create({
      data: {
        id: 'main-task-with-deps',
        name: 'Main Task (Has Dependencies)',
        duration: 120,
        importance: 7,
        urgency: 8,
        type: 'focused',
        dependencies: JSON.stringify([task1.id, task2.id]),
        sessionId: session.id,
        notes: 'This task depends on two prerequisite tasks',
        updatedAt: new Date(),
      },
    })

    console.log('✅ Created main task with dependencies:', JSON.parse(mainTask.dependencies))

    // Create a workflow with step dependencies
    const workflow = await prisma.task.create({
      data: {
        id: 'workflow-with-deps',
        name: 'Workflow with Step Dependencies',
        duration: 0, // Will be calculated from steps
        importance: 6,
        urgency: 7,
        type: 'workflow',
        hasSteps: true,
        sessionId: session.id,
        updatedAt: new Date(),
      },
    })

    // Create workflow steps with dependencies
    const step1 = await prisma.taskStep.create({
      data: {
        id: 'workflow-step-1',
        taskId: workflow.id,
        name: 'Step 1: Initial Setup',
        duration: 30,
        type: 'focused',
        stepIndex: 0,
        dependsOn: JSON.stringify([]),
      },
    })

    const step2 = await prisma.taskStep.create({
      data: {
        id: 'workflow-step-2',
        taskId: workflow.id,
        name: 'Step 2: Process Data',
        duration: 45,
        type: 'focused',
        stepIndex: 1,
        dependsOn: JSON.stringify([step1.id]),
      },
    })

    const step3 = await prisma.taskStep.create({
      data: {
        id: 'workflow-step-3',
        taskId: workflow.id,
        name: 'Step 3: Generate Report (depends on 1 & 2)',
        duration: 60,
        type: 'focused',
        stepIndex: 2,
        dependsOn: JSON.stringify([step1.id, step2.id]),
      },
    })

    console.log('✅ Created workflow with dependent steps')
    console.log('   Step 1:', JSON.parse(step1.dependsOn))
    console.log('   Step 2:', JSON.parse(step2.dependsOn))
    console.log('   Step 3:', JSON.parse(step3.dependsOn))

    console.log('\n📋 Test Data Summary:')
    console.log('------------------------')
    console.log('1. Main Task with Dependencies:')
    console.log(`   - "${mainTask.name}" depends on:`)
    console.log(`     • "${task1.name}"`)
    console.log(`     • "${task2.name}"`)
    console.log('\n2. Workflow with Step Dependencies:')
    console.log('   - Step 1: No dependencies')
    console.log('   - Step 2: Depends on Step 1')
    console.log('   - Step 3: Depends on Steps 1 & 2')

    console.log('\n🎯 Next Steps:')
    console.log('1. Open the application')
    console.log('2. Find "Main Task (Has Dependencies)" in the task list')
    console.log('3. Edit the task and click "Split Task"')
    console.log('4. Split it and verify both parts show dependencies')
    console.log('5. Find "Workflow with Step Dependencies"')
    console.log('6. Edit the workflow and split Step 3')
    console.log('7. Verify both parts inherit dependencies on Steps 1 & 2')

    console.log('\n✨ Test data created successfully!')

  } catch (error) {
    console.error('❌ Error creating test data:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
testDependencyWiring()
