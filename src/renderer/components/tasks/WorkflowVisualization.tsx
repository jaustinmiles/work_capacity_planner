import React from 'react'
import { Modal, Typography, Space, Button } from '@arco-design/web-react'
import { IconClose, IconExpand, IconMindMapping } from '@arco-design/web-react/icon'
import { SequencedTask } from '@shared/sequencing-types'
import { WorkflowGraph } from './WorkflowGraph'

const { Title } = Typography

interface WorkflowVisualizationProps {
  task: SequencedTask | null
  visible: boolean
  onClose: () => void
}

export function WorkflowVisualization({ task, visible, onClose }: WorkflowVisualizationProps) {
  if (!task) return null

  return (
    <Modal
      title={
        <Space>
          <IconMindMapping style={{ fontSize: 20 }} />
          <span>Workflow Visualization: {task.name}</span>
        </Space>
      }
      visible={visible}
      onCancel={onClose}
      footer={
        <Button onClick={onClose}>
          Close
        </Button>
      }
      style={{ width: '90vw', maxWidth: 1200 }}
      bodyStyle={{ height: '70vh', overflow: 'auto' }}
      maskClosable
    >
      <WorkflowGraph task={task} />
    </Modal>
  )
}