import React, { useState } from 'react'
import { Modal, Space, Button, Switch, Popconfirm } from '@arco-design/web-react'
import { IconMindMapping, IconEdit, IconDelete } from '@arco-design/web-react/icon'
import { SequencedTask } from '@shared/sequencing-types'
import { InteractiveWorkflowGraph } from './InteractiveWorkflowGraph'
import { useTaskStore } from '../../store/useTaskStore'
import { Message } from '../common/Message'
import { logger } from '@/logger'


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

  const handleClearAllDependencies = async () => {
    try {
      const updatedSteps = currentTask.steps.map(step => ({ ...step, dependsOn: [] }))
      await updateSequencedTask(currentTask.id, { steps: updatedSteps })
      Message.success(`Cleared all dependencies from ${currentTask.steps.length} steps`)
    } catch (error) {
      logger.ui.error('Failed to clear all dependencies', {
        error: error instanceof Error ? error.message : String(error),
        taskId: currentTask.id,
      }, 'clear-dependencies-error')
      Message.error('Failed to clear dependencies')
    }
  }

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
      logger.ui.error('Failed to update dependencies', {
        error: error instanceof Error ? error.message : String(error),
        taskId: currentTask.id,
        stepId,
      }, 'dependencies-update-error')
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
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Popconfirm
            title="Clear all step dependencies?"
            content="This will remove all dependency links between steps. This cannot be undone."
            onOk={handleClearAllDependencies}
            okText="Clear All"
            okButtonProps={{ status: 'warning' }}
          >
            <Button
              type="outline"
              status="warning"
              size="small"
              icon={<IconDelete />}
            >
              Clear All Dependencies
            </Button>
          </Popconfirm>
          <Space>
            <span>Edit Mode</span>
            <Switch
              checked={isEditMode}
              onChange={setIsEditMode}
              checkedIcon={<IconEdit />}
            />
          </Space>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <InteractiveWorkflowGraph
            task={currentTask}
            isEditable={isEditMode}
            onUpdateDependencies={handleUpdateDependencies}
          />
        </div>
      </div>
    </Modal>
  )
}
