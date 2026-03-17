/**
 * NextTaskModal — Prompted when break phase ends
 *
 * Lets the user choose the next task to work on, continue the
 * previous task, or end the Pomodoro session.
 */

import { Modal, Space, Button, Typography, List } from '@arco-design/web-react'
import { TaskStatus } from '@shared/enums'
import { useTaskStore } from '../../store/useTaskStore'
import { usePomodoroStore, usePomodoroTimer } from '../../store/usePomodoroStore'

const { Text } = Typography

interface NextTaskModalProps {
  visible: boolean
  onClose: () => void
}

export function NextTaskModal({ visible, onClose }: NextTaskModalProps) {
  const { tasks } = useTaskStore()
  const timerState = usePomodoroTimer()
  const { transitionToWork, endCycle, dismissPrompt } = usePomodoroStore()

  // Filter to incomplete, non-archived tasks
  const incompleteTasks = tasks.filter(
    (t) => t.overallStatus !== TaskStatus.Completed && !t.archived,
  )

  const handleSelectTask = async (taskId: string): Promise<void> => {
    await transitionToWork(taskId)
    onClose()
  }

  const handleEndSession = async (): Promise<void> => {
    await endCycle()
    onClose()
  }

  const handleCancel = (): void => {
    dismissPrompt()
    onClose()
  }

  return (
    <Modal
      title="Break's Over — Pick Next Task"
      visible={visible}
      onCancel={handleCancel}
      footer={
        <Space>
          <Button status="warning" onClick={handleEndSession}>End Pomodoro</Button>
        </Space>
      }
      style={{ width: 520 }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="medium">
        <Text>Your break is done! Choose a task for the next work session:</Text>

        {/* Continue previous task option */}
        {timerState.currentTaskId && (
          <Button
            type="primary"
            long
            style={{ height: 44 }}
            onClick={() => handleSelectTask(timerState.currentTaskId!)}
          >
            Continue: {timerState.currentTaskName ?? 'Previous Task'}
          </Button>
        )}

        {/* Task list */}
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
