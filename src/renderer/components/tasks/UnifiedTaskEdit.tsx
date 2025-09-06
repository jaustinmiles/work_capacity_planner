import { useState, useEffect } from 'react'
import { TaskType, StepStatus } from '@shared/enums'
import {
  Card,
  Space,
  Typography,
  Button,
  InputNumber,
  Select,
  List,
  Tag,
  Modal,
  Form,
  Input,
  Grid,
  Popconfirm,
  Divider,
  DatePicker,
} from '@arco-design/web-react'
import {
  IconEdit,
  IconSave,
  IconClose,
  IconUp,
  IconDown,
  IconDelete,
  IconPlus,
  IconClockCircle,
  IconCheckCircle,
  IconScissor,
} from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'
import { useTaskStore } from '../../store/useTaskStore'
import { TaskSplitModal } from './TaskSplitModal'
import { StepSplitModal } from './StepSplitModal'
import { StepWorkSessionsModal } from './StepWorkSessionsModal'
import { DependencyEditor } from '../shared/DependencyEditor'
import { Message } from '../common/Message'
import { getDatabase } from '../../services/database'
import { appEvents, EVENTS } from '../../utils/events'
import { logger } from '../../utils/logger'

const { Title, Text } = Typography
const { TextArea } = Input
const { Row, Col } = Grid
const FormItem = Form.Item

interface UnifiedTaskEditProps {
  task: Task | SequencedTask
  onClose?: () => void
  startInEditMode?: boolean
}

/**
 * Unified component for editing both regular tasks and workflows
 * Combines functionality from TaskEdit and SequencedTaskEdit
 */
export function UnifiedTaskEdit({ task, onClose, startInEditMode = false }: UnifiedTaskEditProps) {
  const { updateTask, updateSequencedTask } = useTaskStore()
  const [editedTask, setEditedTask] = useState<Task | SequencedTask>({ ...task })
  const [isEditing, setIsEditing] = useState(startInEditMode)
  const [isSaving, setIsSaving] = useState(false)
  const [showSplitModal, setShowSplitModal] = useState(false)

  // Workflow-specific state
  const [steps, setSteps] = useState<TaskStep[]>([])
  const [editingStep, setEditingStep] = useState<TaskStep | null>(null)
  const [showStepModal, setShowStepModal] = useState(false)
  const [selectedStepForSessions, setSelectedStepForSessions] = useState<TaskStep | null>(null)
  const [splitStep, setSplitStep] = useState<{ step: TaskStep; index: number } | null>(null)
  const [form] = Form.useForm()

  // Type guards
  const isWorkflow = task.hasSteps || false
  const sequencedTask = isWorkflow ? task as SequencedTask : null

  // Load workflow steps if needed
  useEffect(() => {
    if (isWorkflow && sequencedTask) {
      loadSteps()
    }
  }, [sequencedTask?.id])

  const loadSteps = async () => {
    if (!sequencedTask) return
    try {
      const db = getDatabase()
      // Load steps from the task if they're already present
      if (sequencedTask.steps && sequencedTask.steps.length > 0) {
        setSteps(sequencedTask.steps.sort((a, b) => a.stepIndex - b.stepIndex))
      } else {
        // Otherwise try to load from database
        const tasks = await db.getTasks()
        const thisTask = tasks.find(t => t.id === sequencedTask.id)
        if (thisTask && 'steps' in thisTask && thisTask.steps) {
          setSteps(thisTask.steps.sort((a: TaskStep, b: TaskStep) => a.stepIndex - b.stepIndex))
        }
      }
    } catch (error) {
      logger.ui.error('Failed to load task steps:', error)
      Message.error('Failed to load workflow steps')
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      logger.ui.info('Saving task/workflow changes', {
        taskId: task.id,
        isWorkflow: isWorkflow,
        stepCount: steps.length,
      })

      if (isWorkflow && sequencedTask) {
        // COPIED working save logic for workflows
        // Recalculate durations based on steps
        const totalDuration = steps.reduce((sum, step) => sum + step.duration, 0)
        const totalWaitTime = steps.reduce((sum, step) => sum + (step.asyncWaitTime || 0), 0)
        const criticalPathDuration = totalDuration + totalWaitTime
        const worstCaseDuration = criticalPathDuration * 1.5

        // Clean up step data before sending to database
        const cleanedSteps = steps.map((step, index) => ({
          id: step.id,
          taskId: task.id,
          name: step.name,
          duration: step.duration,
          type: step.type,
          dependsOn: step.dependsOn || [],
          asyncWaitTime: step.asyncWaitTime || 0,
          isAsyncTrigger: step.isAsyncTrigger || false,
          stepIndex: index,
          status: step.status || StepStatus.Pending,
          percentComplete: step.percentComplete || 0,
          actualDuration: step.actualDuration || 0,
          cognitiveComplexity: step.cognitiveComplexity || 3,
          notes: step.notes || '',
          importance: step.importance,
          urgency: step.urgency,
        }))

        // CRITICAL FIX: Ensure deadline is proper Date object for Prisma
        const deadlineForSave = editedTask.deadline
          ? (editedTask.deadline instanceof Date ? editedTask.deadline : new Date(editedTask.deadline))
          : null

        logger.ui.info('Saving workflow with deadline', {
          workflowId: task.id,
          deadlineValue: editedTask.deadline,
          deadlineType: typeof editedTask.deadline,
          deadlineForSave: deadlineForSave,
          deadlineISO: deadlineForSave ? deadlineForSave.toISOString() : 'null',
        })

        await updateSequencedTask(task.id, {
          name: editedTask.name,
          importance: editedTask.importance,
          urgency: editedTask.urgency,
          type: editedTask.type,
          notes: editedTask.notes,
          deadline: deadlineForSave as Date | undefined,
          steps: cleanedSteps,
          duration: totalDuration,
          criticalPathDuration,
          worstCaseDuration,
        })

        // Emit workflow updated event
        appEvents.emit(EVENTS.WORKFLOW_UPDATED)
        logger.ui.info('Workflow saved successfully', { workflowId: task.id, stepCount: cleanedSteps.length })
      } else {
        // Regular task save
        await updateTask(task.id, editedTask)
        appEvents.emit(EVENTS.TASK_UPDATED, { taskId: task.id })
        logger.ui.info('Task saved successfully', { taskId: task.id })
      }

      Message.success(isWorkflow ? 'Workflow updated successfully' : 'Task updated successfully')
      setIsEditing(false)
      onClose?.()
    } catch (error) {
      logger.ui.error('Failed to save task:', error)
      Message.error('Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

  const handleStepEdit = (step: TaskStep) => {
    setEditingStep(step)
    form.setFieldsValue({
      name: step.name,
      duration: step.duration,
      type: step.type,
      notes: step.notes || '',
      cognitiveComplexity: step.cognitiveComplexity || 1,
      // Step-level priority fields
      importance: step.importance || undefined, // Show as empty if null to allow inheritance
      urgency: step.urgency || undefined,
      asyncWaitTime: step.asyncWaitTime || 0,
    })
    setShowStepModal(true)
  }

  const handleStepSave = async () => {
    try {
      const values = await form.validate()
      if (!editingStep) return

      logger.ui.info('Saving step changes', {
        stepId: editingStep.id,
        stepName: values.name,
        isNewStep: editingStep.id === 'new',
      })

      const updatedStep = {
        ...editingStep,
        ...values,
        dependsOn: editingStep.dependsOn || [], // Ensure dependencies are preserved
      }

      let updatedSteps: TaskStep[]
      if (editingStep.id === 'new') {
        // New step
        const newStep: TaskStep = {
          ...updatedStep,
          id: `step-${Date.now()}`,
          taskId: sequencedTask!.id,
          stepIndex: steps.length,
          status: StepStatus.Pending,
          percentComplete: 0,
          actualDuration: 0,
        }
        updatedSteps = [...steps, newStep]
        logger.ui.info('Added new step', { stepId: newStep.id, stepName: newStep.name })
      } else {
        // Update existing step
        updatedSteps = steps.map(s => s.id === editingStep.id ? updatedStep : s)
        logger.ui.info('Updated existing step', { stepId: editingStep.id, stepName: updatedStep.name })
      }

      // Update local state
      setSteps(updatedSteps)

      // CRITICAL FIX: Actually save to database immediately
      if (isWorkflow && sequencedTask) {
        const totalDuration = updatedSteps.reduce((sum, step) => sum + step.duration, 0)
        const totalWaitTime = updatedSteps.reduce((sum, step) => sum + (step.asyncWaitTime || 0), 0)
        const criticalPathDuration = totalDuration + totalWaitTime
        const worstCaseDuration = criticalPathDuration * 1.5

        const cleanedSteps = updatedSteps.map((step, index) => ({
          ...step,
          stepIndex: index,
          dependsOn: step.dependsOn || [],
        }))

        await updateSequencedTask(task.id, {
          name: editedTask.name,
          importance: editedTask.importance,
          urgency: editedTask.urgency,
          type: editedTask.type,
          notes: editedTask.notes,
          deadline: editedTask.deadline,
          steps: cleanedSteps,
          duration: totalDuration,
          criticalPathDuration,
          worstCaseDuration,
        })

        appEvents.emit(EVENTS.WORKFLOW_UPDATED)
        logger.ui.info('Step saved to database', { workflowId: task.id, totalSteps: cleanedSteps.length })
      }

      setShowStepModal(false)
      setEditingStep(null)
      form.resetFields()

      Message.success('Step saved successfully')
    } catch (error) {
      logger.ui.error('Failed to save step:', error)
      Message.error('Failed to save step')
    }
  }

  const handleStepDelete = (stepId: string) => {
    const filtered = steps.filter(s => s.id !== stepId)
    const reindexed = filtered.map((s, idx) => ({ ...s, stepIndex: idx }))
    setSteps(reindexed)
  }

  const handleStepMove = (index: number, direction: 'up' | 'down') => {
    const newSteps = [...steps]
    const targetIndex = direction === 'up' ? index - 1 : index + 1

    if (targetIndex < 0 || targetIndex >= steps.length) return

    // Swap steps
    [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]]

    // Update step indices
    const reindexed = newSteps.map((s, idx) => ({ ...s, stepIndex: idx }))
    setSteps(reindexed)
  }

  const handleStepSplit = async (step1: TaskStep, step2: TaskStep) => {
    if (!splitStep) return

    const { index } = splitStep
    const newSteps = [...steps]

    // Replace original step with step1 and insert step2 after
    newSteps[index] = step1
    newSteps.splice(index + 1, 0, step2)

    // Reindex all steps
    const reindexed = newSteps.map((s, idx) => ({ ...s, stepIndex: idx }))
    setSteps(reindexed)
    setSplitStep(null)
  }

  const handleTaskSplit = (_task1: Task, _task2: Task) => {
    // Task split is handled by the modal itself
    setShowSplitModal(false)
  }

  const renderBasicFields = () => (
    <>
      <Row gutter={16}>
        <Col span={12}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="secondary">Task Name</Text>
            {isEditing ? (
              <Input
                value={editedTask.name}
                onChange={(value) =>
                  setEditedTask({ ...editedTask, name: value })
                }
                placeholder="Enter task name"
              />
            ) : (
              <Title heading={6}>{editedTask.name}</Title>
            )}
          </Space>
        </Col>
        <Col span={12}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="secondary">Type</Text>
            {isEditing ? (
              <Select
                value={editedTask.type}
                onChange={(value) =>
                  setEditedTask({ ...editedTask, type: value })
                }
                style={{ width: '100%' }}
              >
                <Select.Option value={TaskType.Focused}>Focused Work</Select.Option>
                <Select.Option value={TaskType.Admin}>Admin Task</Select.Option>
                <Select.Option value={TaskType.Personal}>Personal Task</Select.Option>
                {isWorkflow && <Select.Option value={'workflow'}>Workflow</Select.Option>}
              </Select>
            ) : (
              <Tag color="blue">{editedTask.type}</Tag>
            )}
          </Space>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={8}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="secondary">Duration (minutes)</Text>
            {isEditing && !isWorkflow ? (
              <InputNumber
                value={editedTask.duration}
                onChange={(value) =>
                  setEditedTask({ ...editedTask, duration: value || 0 })
                }
                min={1}
                style={{ width: '100%' }}
              />
            ) : (
              <Text>
                {editedTask.duration} min
                {isWorkflow && ' (calculated from steps)'}
              </Text>
            )}
          </Space>
        </Col>
        <Col span={8}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="secondary">Importance (1-10)</Text>
            {isEditing ? (
              <InputNumber
                value={editedTask.importance}
                onChange={(value) =>
                  setEditedTask({ ...editedTask, importance: value || 5 })
                }
                min={1}
                max={10}
                style={{ width: '100%' }}
              />
            ) : (
              <Text>{editedTask.importance}</Text>
            )}
          </Space>
        </Col>
        <Col span={8}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="secondary">Urgency (1-10)</Text>
            {isEditing ? (
              <InputNumber
                value={editedTask.urgency}
                onChange={(value) =>
                  setEditedTask({ ...editedTask, urgency: value || 5 })
                }
                min={1}
                max={10}
                style={{ width: '100%' }}
              />
            ) : (
              <Text>{editedTask.urgency}</Text>
            )}
          </Space>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="secondary">Deadline</Text>
            {isEditing ? (
              <DatePicker
                value={editedTask.deadline ? new Date(editedTask.deadline) : undefined}
                onChange={(value) => {
                  logger.ui.info('Deadline changed in editor', {
                    workflowId: task.id,
                    oldDeadline: editedTask.deadline,
                    newDeadline: value,
                  })
                  setEditedTask({ ...editedTask, deadline: value } as any)
                }}
                style={{ width: '100%' }}
                showTime
                format="YYYY-MM-DD HH:mm"
              />
            ) : (
              <Text>
                {editedTask.deadline
                  ? new Date(editedTask.deadline).toLocaleDateString()
                  : 'No deadline'}
              </Text>
            )}
          </Space>
        </Col>
        <Col span={12}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="secondary">Cognitive Complexity (1-5)</Text>
            {isEditing ? (
              <InputNumber
                value={editedTask.cognitiveComplexity || 3}
                onChange={(value) =>
                  setEditedTask({ ...editedTask, cognitiveComplexity: (value || 3) as 1 | 2 | 3 | 4 | 5 })
                }
                min={1}
                max={5}
                style={{ width: '100%' }}
              />
            ) : (
              <Text>{editedTask.cognitiveComplexity || 3}</Text>
            )}
          </Space>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="secondary">Notes</Text>
            {isEditing ? (
              <TextArea
                value={editedTask.notes || ''}
                onChange={(value) =>
                  setEditedTask({ ...editedTask, notes: value })
                }
                placeholder="Add any notes or details..."
                autoSize={{ minRows: 3, maxRows: 6 }}
              />
            ) : (
              <Text>{editedTask.notes || 'No notes'}</Text>
            )}
          </Space>
        </Col>
      </Row>
    </>
  )

  const renderStepsList = () => {
    if (!isWorkflow || !sequencedTask) return null

    return (
      <>
        <Divider />
        <Title heading={5}>Workflow Steps</Title>

        <List
          dataSource={steps}
          render={(step, index) => (
            <List.Item
              key={step.id}
              actions={
                isEditing
                  ? [
                      <Button
                        key="edit"
                        icon={<IconEdit />}
                        size="small"
                        onClick={() => handleStepEdit(step)}
                      />,
                      <Button
                        key="split"
                        icon={<IconScissor />}
                        size="small"
                        onClick={() => setSplitStep({ step, index })}
                      />,
                      <Button
                        key="up"
                        icon={<IconUp />}
                        size="small"
                        disabled={index === 0}
                        onClick={() => handleStepMove(index, 'up')}
                      />,
                      <Button
                        key="down"
                        icon={<IconDown />}
                        size="small"
                        disabled={index === steps.length - 1}
                        onClick={() => handleStepMove(index, 'down')}
                      />,
                      <Popconfirm
                        key="delete"
                        title="Delete this step?"
                        onOk={() => handleStepDelete(step.id)}
                      >
                        <Button icon={<IconDelete />} size="small" status="danger" />
                      </Popconfirm>,
                    ]
                  : [
                      <Button
                        key="sessions"
                        size="small"
                        onClick={() => setSelectedStepForSessions(step)}
                      >
                        View Sessions
                      </Button>,
                    ]
              }
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Text>{`${index + 1}. ${step.name}`}</Text>
                    {step.status === StepStatus.Completed && (
                      <IconCheckCircle style={{ color: 'green' }} />
                    )}
                    {step.status === StepStatus.InProgress && (
                      <IconClockCircle style={{ color: 'orange' }} />
                    )}
                  </Space>
                }
                description={
                  <Space direction="vertical">
                    <Text type="secondary">
                      Duration: {step.duration} min | Type: {step.type} | Progress:{' '}
                      {step.percentComplete}%
                    </Text>
                    {step.dependsOn && step.dependsOn.length > 0 && (
                      <Text type="secondary">
                        Depends on: {Array.isArray(step.dependsOn) ? step.dependsOn.join(', ') : JSON.parse(step.dependsOn).join(', ')}
                      </Text>
                    )}
                    {step.notes && <Text type="secondary">{step.notes}</Text>}
                  </Space>
                }
              />
            </List.Item>
          )}
        />

        {isEditing && (
          <Button
            icon={<IconPlus />}
            onClick={() => {
              const newStep: TaskStep = {
                id: 'new',
                taskId: sequencedTask.id,
                name: '',
                duration: 30,
                type: TaskType.Focused,
                dependsOn: [],
                asyncWaitTime: 0,
                status: StepStatus.Pending,
                stepIndex: steps.length,
                percentComplete: 0,
                actualDuration: 0,
                importance: 5,
                urgency: 5,
                cognitiveComplexity: 3,
              }
              handleStepEdit(newStep)
            }}
            style={{ marginTop: 16 }}
          >
            Add Step
          </Button>
        )}
      </>
    )
  }

  return (
    <>
      <Card
        title={
          <Space>
            {isEditing ? <IconEdit /> : null}
            <Title heading={4}>
              {isWorkflow ? 'Edit Workflow' : 'Edit Task'}
            </Title>
          </Space>
        }
        extra={
          <Space>
            {isEditing ? (
              <>
                <Button
                  icon={<IconSave />}
                  type="primary"
                  onClick={handleSave}
                  loading={isSaving}
                >
                  Save
                </Button>
                {!isWorkflow && (
                  <Button
                    icon={<IconScissor />}
                    onClick={() => setShowSplitModal(true)}
                  >
                    Split Task
                  </Button>
                )}
                <Button
                  icon={<IconClose />}
                  onClick={() => {
                    setEditedTask({ ...task })
                    setIsEditing(false)
                    if (isWorkflow) {
                      loadSteps()
                    }
                  }}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  icon={<IconEdit />}
                  type="primary"
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </Button>
                <Button icon={<IconClose />} onClick={onClose}>
                  Close
                </Button>
              </>
            )}
          </Space>
        }
        style={{ width: '100%' }}
      >
        {renderBasicFields()}
        {renderStepsList()}
      </Card>

      {/* Modals */}
      {!isWorkflow && (
        <TaskSplitModal
          task={editedTask as Task}
          visible={showSplitModal}
          onClose={() => setShowSplitModal(false)}
          onSplit={handleTaskSplit}
        />
      )}

      {isWorkflow && splitStep && (
        <StepSplitModal
          step={splitStep.step}
          stepIndex={splitStep.index}
          visible={!!splitStep}
          onClose={() => setSplitStep(null)}
          onSplit={handleStepSplit}
        />
      )}

      {isWorkflow && selectedStepForSessions && (
        <StepWorkSessionsModal
          stepId={selectedStepForSessions.id}
          stepName={selectedStepForSessions.name}
          taskId={selectedStepForSessions.taskId}
          visible={!!selectedStepForSessions}
          onClose={() => setSelectedStepForSessions(null)}
        />
      )}

      {isWorkflow && editingStep && (
        <Modal
          title={editingStep.id === 'new' ? 'Add Step' : 'Edit Step'}
          visible={showStepModal}
          onCancel={() => {
            setShowStepModal(false)
            setEditingStep(null)
            form.resetFields()
          }}
          onOk={handleStepSave}
        >
          <Form form={form} layout="vertical">
            <FormItem
              field="name"
              label="Step Name"
              rules={[{ required: true, message: 'Please enter a step name' }]}
            >
              <Input placeholder="Enter step name" />
            </FormItem>
            <FormItem field="duration" label="Duration (minutes)" required>
              <InputNumber min={1} style={{ width: '100%' }} />
            </FormItem>

            <FormItem field="asyncWaitTime" label="Async Wait Time (minutes)" tooltip="Time to wait for async operations">
              <InputNumber min={0} placeholder="0 (no async wait)" style={{ width: '100%' }} />
            </FormItem>

            <FormItem field="type" label="Type">
              <Select style={{ width: '100%' }}>
                <Select.Option value={TaskType.Focused}>Focused</Select.Option>
                <Select.Option value={TaskType.Admin}>Admin Task</Select.Option>
                <Select.Option value={TaskType.Personal}>Personal Task</Select.Option>
              </Select>
            </FormItem>
            <FormItem field="cognitiveComplexity" label="Cognitive Complexity (1-5)">
              <InputNumber min={1} max={5} style={{ width: '100%' }} />
            </FormItem>

            {/* Step-level priority fields */}
            <FormItem field="importance" label="Importance (1-10)" tooltip="Step-specific importance (overrides workflow default)">
              <InputNumber min={1} max={10} placeholder="Inherit from workflow" style={{ width: '100%' }} />
            </FormItem>

            <FormItem field="urgency" label="Urgency (1-10)" tooltip="Step-specific urgency (overrides workflow default)">
              <InputNumber min={1} max={10} placeholder="Inherit from workflow" style={{ width: '100%' }} />
            </FormItem>

            <FormItem field="notes" label="Notes">
              <TextArea placeholder="Optional notes" autoSize={{ minRows: 2, maxRows: 4 }} />
            </FormItem>

            {/* Dependencies - COPIED from working SequencedTaskEdit */}
            <div style={{ marginBottom: 24 }}>
              <Typography.Text style={{ display: 'block', marginBottom: 8, fontSize: 14, color: '#86909c' }}>
                Dependencies
              </Typography.Text>
              <DependencyEditor
                currentStepId={editingStep?.id}
                currentStepName={editingStep?.name || 'this step'}
                availableSteps={steps.map((step, idx) => ({
                  id: step.id,
                  name: step.name,
                  stepIndex: idx,
                }))}
                forwardDependencies={editingStep?.dependsOn || []}
                onForwardDependenciesChange={(value) => {
                  logger.ui.info('Updating step dependencies:', { stepId: editingStep?.id, dependencies: value })
                  if (editingStep) {
                    setEditingStep({ ...editingStep, dependsOn: value })
                  }
                }}
              />
            </div>
          </Form>
        </Modal>
      )}
    </>
  )
}

