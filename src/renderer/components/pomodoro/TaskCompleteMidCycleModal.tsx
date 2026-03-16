/**
 * TaskCompleteMidCycleModal — Prompted when active task is completed during work phase
 *
 * Lets the user pick a new task to continue the Pomodoro cycle,
 * or end the cycle early.
 */

import { Modal, Space, Button, Typography, List } from '@arco-design/web-react'
import { TaskStatus } from '@shared/enums'
import { useTaskStore } from '../../store/useTaskStore'
import { usePomodoroStore } from '../../store/usePomodoroStore'

const { Text } = Typography

interface TaskCompleteMidCycleModalProps {
  visible: boolean
  onClose: () => void
}

export function TaskCompleteMidCycleModal({ visible, onClose }: TaskCompleteMidCycleModalProps) {
  const { tasks } = useTaskStore()
  const { switchTaskWithinCycle, endCycle, dismissPrompt } = usePomodoroStore()

  const incompleteTasks = tasks.filter(
    (t) => t.overallStatus !== TaskStatus.Completed,
  )

  const handleSelectTask = async (taskId: string): Promise<void> => {
    await switchTaskWithinCycle(taskId)
    onClose()
  }

  const handleEndEarly = async (): Promise<void> => {
    await endCycle()
    onClose()
  }

  const handleCancel = (): void => {
    dismissPrompt()
    onClose()
  }

  return (
    <Modal
      title="Task Complete! Pick Next Task"
      visible={visible}
      onCancel={handleCancel}
      footer={
        <Space>
          <Button status="warning" onClick={handleEndEarly}>End Pomodoro Early</Button>
        </Space>
      }
      style={{ width: 520 }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="medium">
        <Text>
          Great work! Your task is complete. Pick another task to continue the current work session:
        </Text>

        <List
          dataSource={incompleteTasks}
          size="small"
          style={{ maxHeight: 300, overflowY: 'auto' }}
          render={(task) => (
            <List.Item
              key={task.id}
              style={{ cursor: 'pointer', padding: '8px 12px' }}
              onClick={() => handleSelectTask(task.id)}
              actions={[
                <Button key="select" size="mini" type="text">
                  Select
                </Button>,
              ]}
            >
              <Text>{task.name}</Text>
            </List.Item>
          )}
        />

        {incompleteTasks.length === 0 && (
          <Text type="secondary">No incomplete tasks available.</Text>
        )}
      </Space>
    </Modal>
  )
}
