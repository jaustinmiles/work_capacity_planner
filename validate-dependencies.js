#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function validateDependencies() {
  console.log('=== DEPENDENCY VALIDATION REPORT ===\n');
  
  try {
    // Get all sequenced tasks with their steps
    const workflows = await prisma.sequencedTask.findMany({
      include: {
        TaskStep: true,
      },
    });

    let totalSteps = 0;
    let stepsWithDeps = 0;
    let validDeps = 0;
    let invalidDeps = 0;
    let issues = [];

    for (const workflow of workflows) {
      console.log(`\nWorkflow: ${workflow.name} (${workflow.id})`);
      console.log(`  Steps: ${workflow.TaskStep.length}`);
      
      // Create a map of valid step IDs for this workflow
      const validStepIds = new Set(workflow.TaskStep.map(s => s.id));
      
      for (const step of workflow.TaskStep) {
        totalSteps++;
        
        let deps = [];
        try {
          deps = JSON.parse(step.dependsOn || '[]');
        } catch (e) {
          issues.push(`  ❌ Step "${step.name}" has invalid JSON in dependsOn: ${step.dependsOn}`);
          invalidDeps++;
          continue;
        }
        
        if (deps.length > 0) {
          stepsWithDeps++;
          console.log(`  Step ${step.stepIndex}: ${step.name}`);
          console.log(`    Duration: ${step.duration}min, Async Wait: ${step.asyncWaitTime}min`);
          console.log(`    Dependencies: ${JSON.stringify(deps)}`);
          
          // Validate each dependency
          for (const dep of deps) {
            // Dependencies can be [name, id] or just id
            const depId = Array.isArray(dep) ? dep[dep.length - 1] : dep;
            const depName = Array.isArray(dep) ? dep[0] : 'unknown';
            
            if (validStepIds.has(depId)) {
              validDeps++;
              const depStep = workflow.TaskStep.find(s => s.id === depId);
              if (depStep) {
                console.log(`      ✓ Valid: "${depName}" (${depId.substring(0, 20)}...)`);
                if (depStep.asyncWaitTime > 0) {
                  console.log(`        ⏰ Has ${depStep.asyncWaitTime}min async wait`);
                }
              }
            } else {
              invalidDeps++;
              issues.push(`  ❌ Step "${step.name}" references non-existent dependency: ${depId}`);
              console.log(`      ✗ Invalid: "${depName}" (${depId})`);
            }
          }
        }
      }
    }

    // Check for circular dependencies
    console.log('\n=== CIRCULAR DEPENDENCY CHECK ===');
    for (const workflow of workflows) {
      const visited = new Set();
      const recursionStack = new Set();
      
      function hasCycle(stepId, path = []) {
        if (recursionStack.has(stepId)) {
          const cycle = [...path, stepId];
          issues.push(`  🔄 Circular dependency detected in workflow "${workflow.name}": ${cycle.join(' -> ')}`);
          return true;
        }
        
        if (visited.has(stepId)) return false;
        
        visited.add(stepId);
        recursionStack.add(stepId);
        
        const step = workflow.TaskStep.find(s => s.id === stepId);
        if (step) {
          const deps = JSON.parse(step.dependsOn || '[]');
          for (const dep of deps) {
            const depId = Array.isArray(dep) ? dep[dep.length - 1] : dep;
            if (hasCycle(depId, [...path, stepId])) {
              return true;
            }
          }
        }
        
        recursionStack.delete(stepId);
        return false;
      }
      
      for (const step of workflow.TaskStep) {
        if (!visited.has(step.id)) {
          hasCycle(step.id);
        }
      }
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Total workflows: ${workflows.length}`);
    console.log(`Total steps: ${totalSteps}`);
    console.log(`Steps with dependencies: ${stepsWithDeps}`);
    console.log(`Valid dependencies: ${validDeps}`);
    console.log(`Invalid dependencies: ${invalidDeps}`);
    
    if (issues.length > 0) {
      console.log('\n=== ISSUES FOUND ===');
      issues.forEach(issue => console.log(issue));
    } else {
      console.log('\n✅ No dependency issues found!');
    }

    // Look for steps that might be blocked forever
    console.log('\n=== SCHEDULING ANALYSIS ===');
    for (const workflow of workflows) {
      const stepMap = new Map(workflow.TaskStep.map(s => [s.id, s]));
      
      for (const step of workflow.TaskStep) {
        const deps = JSON.parse(step.dependsOn || '[]');
        let totalWaitTime = 0;
        
        for (const dep of deps) {
          const depId = Array.isArray(dep) ? dep[dep.length - 1] : dep;
          const depStep = stepMap.get(depId);
          if (depStep && depStep.asyncWaitTime > 0) {
            totalWaitTime = Math.max(totalWaitTime, depStep.asyncWaitTime);
          }
        }
        
        if (totalWaitTime >= 1440) {
          console.log(`  ⏳ "${step.name}" must wait at least ${totalWaitTime}min (${(totalWaitTime/60).toFixed(1)}h) for dependencies`);
        }
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

validateDependencies();