import { Button } from '@arco-design/web-react'
import { useTaskStore } from '../../store/useTaskStore'
import { SequencedTask } from '@shared/sequencing-types'

export function TestWorkflowCreator() {
  const { addSequencedTask } = useTaskStore()

  const createTestWorkflow = async () => {
    const testWorkflow: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'> = {
      name: 'Test Workflow with Dependencies',
      importance: 7,
      urgency: 7,
      type: 'focused',
      dependencies: [],
      completed: false,
      notes: 'Test workflow to verify dependency rendering',
      duration: 180,
      criticalPathDuration: 180,
      worstCaseDuration: 240,
      overallStatus: 'not_started',
      steps: [
        {
          id: 'step-test-1',
          name: 'Step 1: Initial Setup',
          duration: 30,
          type: 'focused',
          dependsOn: [],
          asyncWaitTime: 0,
          status: 'pending',
          stepIndex: 0,
        },
        {
          id: 'step-test-2',
          name: 'Step 2: Main Work',
          duration: 60,
          type: 'focused',
          dependsOn: ['step-test-1'],
          asyncWaitTime: 0,
          status: 'pending',
          stepIndex: 1,
        },
        {
          id: 'step-test-3',
          name: 'Step 3: Review',
          duration: 30,
          type: 'admin',
          dependsOn: ['step-test-2'],
          asyncWaitTime: 30,
          status: 'pending',
          stepIndex: 2,
        },
        {
          id: 'step-test-4',
          name: 'Step 4: Final Steps',
          duration: 30,
          type: 'focused',
          dependsOn: ['step-test-2', 'step-test-3'],
          asyncWaitTime: 0,
          status: 'pending',
          stepIndex: 3,
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
