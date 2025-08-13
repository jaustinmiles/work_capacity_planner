#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testDatabaseOperations() {
  console.log('Testing database operations...\n');
  
  try {
    // Test 1: Get active session
    console.log('1. Testing session retrieval...');
    const session = await prisma.session.findFirst({
      where: { isActive: true }
    });
    console.log(`   ✓ Found active session: ${session?.name || 'None'}`);
    
    // Test 2: Get tasks
    console.log('\n2. Testing task retrieval...');
    const tasks = await prisma.task.findMany({
      where: { sessionId: session?.id },
      take: 5
    });
    console.log(`   ✓ Found ${tasks.length} tasks`);
    
    // Test 3: Get sequenced tasks
    console.log('\n3. Testing sequenced task retrieval...');
    const sequencedTasks = await prisma.sequencedTask.findMany({
      where: { sessionId: session?.id },
      include: { TaskStep: true },
      take: 5
    });
    console.log(`   ✓ Found ${sequencedTasks.length} sequenced tasks`);
    
    // Test 4: Get work patterns
    console.log('\n4. Testing work pattern retrieval...');
    const patterns = await prisma.workPattern.findMany({
      where: { sessionId: session?.id },
      include: { WorkBlock: true, WorkMeeting: true },
      take: 5
    });
    console.log(`   ✓ Found ${patterns.length} work patterns`);
    
    // Test 5: Get job contexts
    console.log('\n5. Testing job context retrieval...');
    const contexts = await prisma.jobContext.findMany({
      where: { sessionId: session?.id },
      include: { ContextEntry: true }
    });
    console.log(`   ✓ Found ${contexts.length} job contexts`);
    
    // Test 6: Check Task schema
    console.log('\n6. Verifying Task schema...');
    if (tasks.length > 0) {
      const task = tasks[0];
      const requiredFields = ['id', 'name', 'duration', 'hasSteps', 'overallStatus', 'criticalPathDuration', 'worstCaseDuration'];
      const missingFields = requiredFields.filter(field => !(field in task));
      
      if (missingFields.length === 0) {
        console.log('   ✓ All required fields present in Task');
      } else {
        console.log(`   ✗ Missing fields in Task: ${missingFields.join(', ')}`);
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('Database Summary:');
    console.log(`  Active Session: ${session?.name || 'None'}`);
    console.log(`  Tasks: ${tasks.length}`);
    console.log(`  Workflows: ${sequencedTasks.length}`);
    console.log(`  Work Patterns: ${patterns.length}`);
    console.log(`  Job Contexts: ${contexts.length}`);
    console.log('='.repeat(50));
    
    console.log('\n✅ All database operations completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Database operation failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabaseOperations();