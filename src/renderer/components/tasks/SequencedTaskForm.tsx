import { useState } from 'react'
import { Modal, Form, Input, Select, InputNumber, Button, Space, Card, Typography, Divider, Alert, DatePicker } from '@arco-design/web-react'
import { IconPlus, IconDelete } from '@arco-design/web-react/icon'
import { TaskStep } from '@shared/sequencing-types'
import dayjs from 'dayjs'
import { generateRandomStepId, mapDependenciesToIds } from '@shared/step-id-utils'
import { useSortedUserTaskTypes } from '@renderer/store/useUserTaskTypeStore'

const { TextArea } = Input
const { Title, Text } = Typography

interface SequencedTaskFormProps {
  visible: boolean
  onClose: () => void
  onSubmit: (__taskData: any) => void
}

export function SequencedTaskForm({ visible, onClose, onSubmit }: SequencedTaskFormProps) {
  const [form] = Form.useForm()
  const userTaskTypes = useSortedUserTaskTypes()
  const initialDefaultType = userTaskTypes[0]?.id || ''
  const [defaultStepType, setDefaultStepType] = useState(initialDefaultType)
  const [steps, setSteps] = useState<Partial<TaskStep>[]>([
    { id: generateRandomStepId(), name: '', duration: 60, type: initialDefaultType, dependsOn: [], asyncWaitTime: 0 },
  ])

  const addStep = () => {
    setSteps([...steps, {
      id: generateRandomStepId(),
      name: '',
      duration: 60,
      type: defaultStepType,
      dependsOn: [],
      asyncWaitTime: 0,
    }])
  }

  const removeStep = (index: number) => {
    if (steps.length > 1) {
      setSteps(steps.filter((_, i) => i !== index))
    }
  }

  const updateStep = (index: number, field: string, value: any) => {
    const newSteps = [...steps]
    newSteps[index] = { ...newSteps[index], [field]: value }
    setSteps(newSteps)
  }

  const getAvailableDependencies = (currentIndex: number) => {
    return steps.slice(0, currentIndex).map((step, index) => ({
      label: step.name || `Step ${index + 1}`,
      value: step.id || `step-${index}`, // Use the actual step ID
    }))
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validate()

      // Build the sequenced task with proper IDs
      const stepsWithNames: any[] = steps.map((step, index) => ({
        id: step.id || generateRandomStepId(),
        taskId: '',  // Will be set when saved
        name: step.name || `Step ${index + 1}`,
        duration: step.duration || 60,
        type: step.type || defaultStepType, // Use selected default step type
        dependsOn: step.dependsOn || [],
        asyncWaitTime: step.asyncWaitTime || 0,
        status: 'pending' as const,
        stepIndex: index,
        percentComplete: 0,
      }))

      // Map dependencies properly (handles name-based dependencies)
      const sequencedSteps: TaskStep[] = mapDependenciesToIds(stepsWithNames)

      const totalDuration = sequencedSteps.reduce((sum, step) => sum + step.duration, 0)
      const criticalPathDuration = totalDuration + Math.max(...sequencedSteps.map(s => s.asyncWaitTime))
      const worstCaseDuration = totalDuration * 2 // Rough estimate including retries

      const sequencedTask = {
        ...values,
        steps: sequencedSteps,
        duration: totalDuration,
        criticalPathDuration,
        worstCaseDuration,
        overallStatus: 'not_started',
        dependencies: [],
        completed: false,
        cognitiveComplexity: values.cognitiveComplexity || 3,
        deadline: values.deadline ? dayjs(values.deadline).toISOString() : null,
        hasSteps: true,
        // Workflows don't have types - only steps have types for scheduling
      }

      onSubmit(sequencedTask)
      form.resetFields()
      setDefaultStepType(initialDefaultType)
      setSteps([{ id: generateRandomStepId(), name: '', duration: 60, type: initialDefaultType, dependsOn: [], asyncWaitTime: 0 }])
      onClose()
    } catch (__error) {
      // Form validation failed
    }
  }

  return (
    <Modal
      title="Create Sequenced Task"
      visible={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      autoFocus={false}
      focusLock={true}
      okText="Create Sequenced Task"
      style={{ width: 800 }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          importance: 5,
          urgency: 5,
        }}
      >
        <Form.Item
          label="Task Name"
          field="name"
          rules={[{ required: true, message: 'Please enter a task name' }]}
        >
          <Input placeholder="e.g., Feature Implementation with CI/CD and Code Review" />
        </Form.Item>

        <Space>
          <Form.Item
            label="Importance (1-10)"
            field="importance"
            rules={[{ required: true }]}
            style={{ width: 120 }}
          >
            <InputNumber min={1} max={10} />
          </Form.Item>

          <Form.Item
            label="Urgency (1-10)"
            field="urgency"
            rules={[{ required: true }]}
            style={{ width: 120 }}
          >
            <InputNumber min={1} max={10} />
          </Form.Item>

          <Form.Item
            label="Cognitive Complexity"
            field="cognitiveComplexity"
            style={{ width: 150 }}
          >
            <InputNumber min={1} max={5} defaultValue={3} />
          </Form.Item>

          <Form.Item
            label="Deadline"
            field="deadline"
            style={{ width: 200 }}
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm"
              placeholder="Optional deadline"
              disabledDate={(date) => dayjs(date).isBefore(dayjs(), 'day')}
            />
          </Form.Item>
        </Space>

        <Form.Item
          label="Notes"
          field="notes"
        >
          <TextArea
            placeholder="Describe the overall workflow and any special considerations..."
            rows={2}
          />
        </Form.Item>

        <Divider />

        <div style={{ marginBottom: 16 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
            <Title heading={6}>Workflow Steps</Title>
            <Button
              type="primary"
              size="small"
              icon={<IconPlus />}
              onClick={addStep}
            >
              Add Step
            </Button>
          </Space>
          <Space style={{ marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Default type for new steps:</Text>
            <Select
              size="small"
              value={defaultStepType}
              onChange={setDefaultStepType}
              style={{ width: 150 }}
              disabled={userTaskTypes.length === 0}
            >
              {userTaskTypes.map(taskType => (
                <Select.Option key={taskType.id} value={taskType.id}>
                  {taskType.emoji} {taskType.name}
                </Select.Option>
              ))}
            </Select>
          </Space>
          <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
            Define the sequence of steps for this task. Steps will execute in order based on dependencies.
          </Text>
        </div>

        {steps.map((step, index) => (
          <Card
            key={index}
            size="small"
            style={{ marginBottom: 12 }}
            title={
              <Space>
                <Text style={{ fontWeight: 500 }}>Step {index + 1}</Text>
                {steps.length > 1 && (
                  <Button
                    type="text"
                    size="mini"
                    status="danger"
                    icon={<IconDelete />}
                    onClick={() => removeStep(index)}
                  />
                )}
              </Space>
            }
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input
                placeholder="Step name (e.g., Data Mining, Code Authoring)"
                value={step.name}
                onChange={(value) => updateStep(index, 'name', value)}
              />

              <Space>
                <div>
                  <Text style={{ fontSize: 12, color: '#86909C' }}>Duration (minutes)</Text>
                  <InputNumber
                    min={5}
                    step={5}
                    value={step.duration}
                    onChange={(value) => updateStep(index, 'duration', value)}
                    style={{ width: 100, display: 'block' }}
                  />
                </div>

                <div>
                  <Text style={{ fontSize: 12, color: '#86909C' }}>Type</Text>
                  <Select
                    value={step.type}
                    onChange={(value) => updateStep(index, 'type', value)}
                    style={{ width: 140, display: 'block' }}
                    disabled={userTaskTypes.length === 0}
                  >
                    {userTaskTypes.map(taskType => (
                      <Select.Option key={taskType.id} value={taskType.id}>
                        {taskType.emoji} {taskType.name}
                      </Select.Option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Text style={{ fontSize: 12, color: '#86909C' }}>Async Wait (minutes)</Text>
                  <InputNumber
                    min={0}
                    step={5}
                    value={step.asyncWaitTime}
                    onChange={(value) => updateStep(index, 'asyncWaitTime', value)}
                    style={{ width: 120, display: 'block' }}
                  />
                </div>
              </Space>

              {index > 0 && (
                <div>
                  <Text style={{ fontSize: 12, color: '#86909C' }}>Depends on steps:</Text>
                  <Select
                    mode="multiple"
                    placeholder="Select prerequisite steps"
                    value={step.dependsOn}
                    onChange={(value) => updateStep(index, 'dependsOn', value)}
                    style={{ width: '100%', marginTop: 4 }}
                  >
                    {getAvailableDependencies(index).map(dep => (
                      <Select.Option key={dep.value} value={dep.value}>
                        {dep.label}
                      </Select.Option>
                    ))}
                  </Select>
                </div>
              )}
            </Space>
          </Card>
        ))}

        <Alert
          type="info"
          content={
            <div>
              <Text style={{ fontWeight: 500 }}>Sequencing Tips:</Text>
              <ul style={{ margin: '8px 0', paddingLeft: 16 }}>
                <li>Steps execute in dependency order, not list order</li>
                <li>Async wait times pause workflow until external processes complete</li>
                <li>Use realistic time estimates including worst-case scenarios</li>
                <li>Dependencies ensure steps wait for prerequisites</li>
              </ul>
            </div>
          }
        />
      </Form>
    </Modal>
  )
}
