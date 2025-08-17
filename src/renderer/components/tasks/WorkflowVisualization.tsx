import React, { useState } from 'react'
import { Modal, Space, Button, Switch } from '@arco-design/web-react'
import { IconMindMapping, IconEdit } from '@arco-design/web-react/icon'
import { SequencedTask } from '@shared/sequencing-types'
import { WorkflowGraph } from './WorkflowGraph'
import { InteractiveWorkflowGraph } from './InteractiveWorkflowGraph'
import { useTaskStore } from '../../store/useTaskStore'
import { logger } from '../../utils/logger'


// Typography components

interface WorkflowVisualizationProps {
  task: SequencedTask | null
  visible: boolean
  onClose: () => void
}

export function WorkflowVisualization({ task, visible, onClose }: WorkflowVisualizationProps) {
  const [isEditMode, setIsEditMode] = useState(false)
  const { updateSequencedTask, sequencedTasks } = useTaskStore()

  // Reset edit mode when modal closes
  React.useEffect(() => {
    if (!visible) {
      setIsEditMode(false)
    }
  }, [visible])

  if (!task) return null

  // Use the latest task data from store
  const currentTask = sequencedTasks.find(t => t.id === task.id) || task

  const handleUpdateDependencies = async (stepId: string, dependencies: string[]) => {
    try {
      const updatedSteps = currentTask.steps.map(step =>
        step.id === stepId
          ? { ...step, dependsOn: dependencies }
          : step,
      )

      await updateSequencedTask(currentTask.id, {
        steps: updatedSteps,
      })
    } catch (error) {
      logger.error('Failed to update dependencies:', error)
    }
  }

  return (
    <Modal
      title={
        <Space>
          <IconMindMapping style={{ fontSize: 20 }} />
          <span>Workflow Visualization: {currentTask.name}</span>
        </Space>
      }
      visible={visible}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>
            Close
          </Button>
        </Space>
      }
      style={{ width: '90vw', maxWidth: 1200 }}
      maskClosable
    >
      <div style={{ height: '70vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <Space>
            <span>Edit Mode</span>
            <Switch
              checked={isEditMode}
              onChange={setIsEditMode}
              checkedIcon={<IconEdit />}
            />
          </Space>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: isEditMode ? 'hidden' : 'auto' }}>
          {isEditMode ? (
            <InteractiveWorkflowGraph
              task={currentTask}
              isEditable={true}
              onUpdateDependencies={handleUpdateDependencies}
            />
          ) : (
            <WorkflowGraph task={currentTask} />
          )}
        </div>
      </div>
    </Modal>
  )
}
