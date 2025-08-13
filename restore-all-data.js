#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const Database = require('better-sqlite3');

async function restoreAllData() {
  const sourceDb = new Database('dev.db', { readonly: true });
  const prisma = new PrismaClient();

  try {
    console.log('Starting comprehensive data restoration...\n');

    // Get or create active session
    let session = await prisma.session.findFirst({ where: { isActive: true } });
    if (!session) {
      session = await prisma.session.create({
        data: {
          id: '8-12',
          name: 'Default Session',
          description: 'Restored session',
          isActive: true
        }
      });
    }
    console.log(`Using session: ${session.name} (${session.id})`);

    // 1. Restore Sessions
    console.log('\n1. Restoring sessions...');
    const sessions = sourceDb.prepare('SELECT * FROM Session').all();
    for (const s of sessions) {
      if (s.id !== session.id) {
        await prisma.session.upsert({
          where: { id: s.id },
          create: { ...s, isActive: false },
          update: { ...s, isActive: false }
        });
      }
    }
    console.log(`   ✓ Restored ${sessions.length} sessions`);

    // 2. Restore Tasks
    console.log('\n2. Restoring tasks...');
    const tasks = sourceDb.prepare('SELECT * FROM Task').all();
    let taskCount = 0;
    for (const task of tasks) {
      try {
        await prisma.task.upsert({
          where: { id: task.id },
          create: {
            ...task,
            sessionId: task.sessionId || session.id,
            completed: Boolean(task.completed),
            hasSteps: Boolean(task.hasSteps) || false,
            overallStatus: task.overallStatus || 'not_started',
            criticalPathDuration: task.criticalPathDuration || task.duration,
            worstCaseDuration: task.worstCaseDuration || task.duration,
            completedAt: task.completedAt ? new Date(task.completedAt) : null,
            deadline: task.deadline ? new Date(task.deadline) : null,
            createdAt: new Date(task.createdAt),
            updatedAt: new Date(task.updatedAt)
          },
          update: {}
        });
        taskCount++;
      } catch (err) {
        console.log(`   Warning: Could not restore task ${task.name}: ${err.message}`);
      }
    }
    console.log(`   ✓ Restored ${taskCount} tasks`);

    // 3. Try to restore SequencedTasks if they exist
    console.log('\n3. Checking for workflows...');
    try {
      const workflows = sourceDb.prepare('SELECT * FROM SequencedTask').all();
      let workflowCount = 0;
      for (const wf of workflows) {
        try {
          await prisma.sequencedTask.upsert({
            where: { id: wf.id },
            create: {
              ...wf,
              sessionId: wf.sessionId || session.id,
              totalDuration: wf.totalDuration || wf.duration || 0,
              createdAt: new Date(wf.createdAt),
              updatedAt: new Date(wf.updatedAt)
            },
            update: {}
          });
          workflowCount++;
        } catch (err) {
          console.log(`   Warning: Could not restore workflow ${wf.name}: ${err.message}`);
        }
      }
      console.log(`   ✓ Restored ${workflowCount} workflows`);

      // Restore TaskSteps
      const steps = sourceDb.prepare('SELECT * FROM TaskStep').all();
      for (const step of steps) {
        try {
          await prisma.taskStep.upsert({
            where: { id: step.id },
            create: step,
            update: {}
          });
        } catch (err) {
          // Ignore step errors
        }
      }
    } catch (err) {
      console.log('   No workflows found in backup');
    }

    // 4. Try to restore WorkPatterns
    console.log('\n4. Checking for work patterns...');
    try {
      const patterns = sourceDb.prepare('SELECT * FROM WorkPattern').all();
      let patternCount = 0;
      for (const pattern of patterns) {
        try {
          await prisma.workPattern.upsert({
            where: { 
              sessionId_date: {
                sessionId: pattern.sessionId || session.id,
                date: pattern.date
              }
            },
            create: {
              ...pattern,
              sessionId: pattern.sessionId || session.id,
              createdAt: new Date(pattern.createdAt),
              updatedAt: new Date(pattern.updatedAt)
            },
            update: {}
          });
          patternCount++;
        } catch (err) {
          console.log(`   Warning: Could not restore pattern: ${err.message}`);
        }
      }
      console.log(`   ✓ Restored ${patternCount} work patterns`);

      // Restore WorkBlocks
      try {
        const blocks = sourceDb.prepare('SELECT * FROM WorkBlock').all();
        for (const block of blocks) {
          await prisma.workBlock.upsert({
            where: { id: block.id },
            create: block,
            update: {}
          });
        }
      } catch (err) {
        // Ignore
      }
    } catch (err) {
      console.log('   No work patterns found in backup');
    }

    // 5. Try to restore JobContexts
    console.log('\n5. Checking for job contexts...');
    try {
      const contexts = sourceDb.prepare('SELECT * FROM JobContext').all();
      let contextCount = 0;
      for (const ctx of contexts) {
        try {
          await prisma.jobContext.upsert({
            where: { id: ctx.id },
            create: {
              ...ctx,
              sessionId: ctx.sessionId || session.id,
              createdAt: new Date(ctx.createdAt),
              updatedAt: new Date(ctx.updatedAt)
            },
            update: {}
          });
          contextCount++;
        } catch (err) {
          console.log(`   Warning: Could not restore context: ${err.message}`);
        }
      }
      console.log(`   ✓ Restored ${contextCount} job contexts`);
    } catch (err) {
      console.log('   No job contexts found in backup');
    }

    // Final summary
    console.log('\n' + '='.repeat(50));
    const finalTasks = await prisma.task.count();
    const finalWorkflows = await prisma.sequencedTask.count();
    const finalPatterns = await prisma.workPattern.count();
    const finalContexts = await prisma.jobContext.count();
    
    console.log('Final Database State:');
    console.log(`  Tasks: ${finalTasks}`);
    console.log(`  Workflows: ${finalWorkflows}`);
    console.log(`  Work Patterns: ${finalPatterns}`);
    console.log(`  Job Contexts: ${finalContexts}`);
    console.log('='.repeat(50));
    
    console.log('\n✅ Data restoration completed!');

  } catch (error) {
    console.error('❌ Restoration failed:', error);
  } finally {
    sourceDb.close();
    await prisma.$disconnect();
  }
}

restoreAllData();