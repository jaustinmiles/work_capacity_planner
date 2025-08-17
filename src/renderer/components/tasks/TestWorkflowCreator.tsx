import { Button } from '@arco-design/web-react'
import { TaskType } from '@shared/enums'
import { useTaskStore } from '../../store/useTaskStore'
import { SequencedTask } from '@shared/sequencing-types'

export function TestWorkflowCreator() {
  const { addSequencedTask } = useTaskStore()

  const createTestWorkflow = async () => {
    const testWorkflow: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt'> = {
      name: 'Test Workflow with Dependencies',
      importance: 7,
      urgency: 7,
      type: TaskType.Focused,
      dependencies: [],
      completed: false,
      notes: 'Test workflow to verify dependency rendering',
      duration: 180,
      criticalPathDuration: 180,
      worstCaseDuration: 240,
      overallStatus: 'not_started',
      sessionId: 'default',  // Add required sessionId
      asyncWaitTime: 0,
      hasSteps: true,
      steps: [
        {
          id: 'step-test-1',
          taskId: '',  // Will be set when saved
          name: 'Step 1: Initial Setup',
          duration: 30,
          type: TaskType.Focused,
          dependsOn: [],
          asyncWaitTime: 0,
          status: 'pending',
          stepIndex: 0,
          percentComplete: 0,
        },
        {
          id: 'step-test-2',
          taskId: '',  // Will be set when saved
          name: 'Step 2: Main Work',
          duration: 60,
          type: TaskType.Focused,
          dependsOn: ['step-test-1'],
          asyncWaitTime: 0,
          status: 'pending',
          stepIndex: 1,
          percentComplete: 0,
        },
        {
          id: 'step-test-3',
          taskId: '',  // Will be set when saved
          name: 'Step 3: Review',
          duration: 30,
          type: TaskType.Admin,
          dependsOn: ['step-test-2'],
          asyncWaitTime: 30,
          status: 'pending',
          stepIndex: 2,
          percentComplete: 0,
        },
        {
          id: 'step-test-4',
          taskId: '',  // Will be set when saved
          name: 'Step 4: Final Steps',
          duration: 30,
          type: TaskType.Focused,
          dependsOn: ['step-test-2', 'step-test-3'],
          asyncWaitTime: 0,
          status: 'pending',
          stepIndex: 3,
          percentComplete: 0,
        },
      ],
    }

    await addSequencedTask(testWorkflow)
  }

  return (
    <Button type="primary" onClick={createTestWorkflow}>
      Create Test Workflow
    </Button>
  )
}
