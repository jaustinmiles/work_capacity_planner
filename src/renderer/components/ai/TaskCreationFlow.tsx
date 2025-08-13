import { useState, useEffect } from 'react'
import { Modal, Button, Typography, Card, Space, Input, Form, InputNumber, Select, Alert, Spin } from '@arco-design/web-react'
import { IconQuestionCircle, IconCheckCircle } from '@arco-design/web-react/icon'
import { getDatabase } from '../../services/database'
import { useTaskStore } from '../../store/useTaskStore'

const { TextArea } = Input
const { Text, Title } = Typography

interface TaskCreationFlowProps {
  visible: boolean
  onClose: () => void
  extractedTasks: ExtractedTask[]
}

interface ExtractedTask {
  name: string
  description: string
  estimatedDuration: number
  importance: number
  urgency: number
  type: 'focused' | 'admin'
  needsMoreInfo?: boolean
}

interface ContextualQuestion {
  question: string
  type: 'text' | 'number' | 'choice'
  choices?: string[]
  purpose: string
}

interface TaskWithContext extends ExtractedTask {
  id: string
  status: 'pending' | 'gathering_context' | 'enhancing' | 'ready' | 'created'
  questions?: ContextualQuestion[]
  answers?: Record<string, any>
  enhancedSuggestions?: any
}

export function TaskCreationFlow({ visible, onClose, extractedTasks }: TaskCreationFlowProps) {
  const [tasks, setTasks] = useState<TaskWithContext[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentStep, setCurrentStep] = useState<'review' | 'context' | 'enhance' | 'create'>('review')
  const { addTask } = useTaskStore()

  // Initialize tasks when modal opens
  useEffect(() => {
    if (visible && extractedTasks.length > 0) {
      const initialTasks: TaskWithContext[] = extractedTasks.map((task, index) => ({
        ...task,
        id: `task-${index}`,
        status: task.needsMoreInfo ? 'pending' : 'ready',
      }))
      setTasks(initialTasks)
      setCurrentStep('review')
      setSelectedTaskId(null)
    }
  }, [visible, extractedTasks])

  const selectedTask = tasks.find(t => t.id === selectedTaskId)

  const handleTaskClick = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    setSelectedTaskId(taskId)

    if (task.needsMoreInfo && !task.questions) {
      setCurrentStep('context')
      await gatherContext(task)
    } else if (task.status === 'ready') {
      setCurrentStep('enhance')
      await enhanceTask(task)
    }
  }

  const gatherContext = async (task: TaskWithContext) => {
    setIsProcessing(true)
    try {
      const result = await getDatabase().getContextualQuestions(task.name, task.description)

      setTasks(prev => prev.map(t =>
        t.id === task.id
          ? { ...t, questions: result.questions, status: 'gathering_context' }
          : t,
      ))
    } catch (error) {
      console.error('Error getting contextual questions:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const enhanceTask = async (task: TaskWithContext) => {
    setIsProcessing(true)
    try {
      const currentDetails = {
        description: task.description,
        duration: task.estimatedDuration,
        importance: task.importance,
        urgency: task.urgency,
      }

      const result = await getDatabase().enhanceTaskDetails(task.name, currentDetails)

      setTasks(prev => prev.map(t =>
        t.id === task.id
          ? { ...t, enhancedSuggestions: result, status: 'enhancing' }
          : t,
      ))
    } catch (error) {
      console.error('Error enhancing task:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleAnswerSubmit = async (answers: Record<string, any>) => {
    if (!selectedTask) return

    const updatedTask = { ...selectedTask, answers, status: 'ready' as const }
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? updatedTask : t))

    setCurrentStep('enhance')
    await enhanceTask(updatedTask)
  }

  const createTask = async (task: TaskWithContext, useEnhancements: boolean = false) => {
    setIsProcessing(true)
    try {
      const taskData = {
        name: task.name,
        duration: useEnhancements && task.enhancedSuggestions?.suggestions?.duration
          ? task.enhancedSuggestions.suggestions.duration
          : task.estimatedDuration,
        importance: useEnhancements && task.enhancedSuggestions?.suggestions?.importance
          ? task.enhancedSuggestions.suggestions.importance
          : task.importance,
        urgency: useEnhancements && task.enhancedSuggestions?.suggestions?.urgency
          ? task.enhancedSuggestions.suggestions.urgency
          : task.urgency,
        type: useEnhancements && task.enhancedSuggestions?.suggestions?.type
          ? task.enhancedSuggestions.suggestions.type
          : task.type,
        notes: useEnhancements && task.enhancedSuggestions?.suggestions?.description
          ? task.enhancedSuggestions.suggestions.description
          : task.description,
        dependencies: [],
        asyncWaitTime: 0,
        completed: false,
        sessionId: '',  // Will be set by database
        hasSteps: false,
        overallStatus: 'not_started' as const,
        criticalPathDuration: parsedData.duration,
        worstCaseDuration: parsedData.duration,
      }

      await addTask(taskData)

      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, status: 'created' } : t,
      ))
    } catch (error) {
      console.error('Error creating task:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const createAllTasks = async (useEnhancements: boolean = false) => {
    setIsProcessing(true)
    try {
      const tasksToCreate = tasks.filter(t => t.status === 'ready' || t.status === 'enhancing')

      for (const task of tasksToCreate) {
        await createTask(task, useEnhancements)
      }

      onClose()
    } catch (error) {
      console.error('Error creating tasks:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const getStatusColor = (status: TaskWithContext['status']) => {
    switch (status) {
      case 'pending': return 'orange'
      case 'gathering_context': return 'blue'
      case 'enhancing': return 'purple'
      case 'ready': return 'green'
      case 'created': return 'gray'
      default: return 'gray'
    }
  }

  const getStatusText = (status: TaskWithContext['status']) => {
    switch (status) {
      case 'pending': return 'Needs Info'
      case 'gathering_context': return 'Gathering Context'
      case 'enhancing': return 'AI Enhancing'
      case 'ready': return 'Ready to Create'
      case 'created': return 'Created'
      default: return 'Unknown'
    }
  }

  return (
    <Modal
      title="Create Tasks from AI Analysis"
      visible={visible}
      onCancel={onClose}
      footer={
        currentStep === 'review' ? (
          <Space>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="primary"
              onClick={() => createAllTasks(false)}
              disabled={isProcessing || tasks.every(t => t.status === 'pending' || t.status === 'created')}
              loading={isProcessing}
            >
              Create All Tasks
            </Button>
          </Space>
        ) : (
          <Space>
            <Button onClick={() => {
              setCurrentStep('review')
              setSelectedTaskId(null)
            }}>
              Back to Overview
            </Button>
          </Space>
        )
      }
      style={{ width: 900 }}
    >
      {currentStep === 'review' && (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Alert
            type="info"
            content="Click on tasks that need more information to provide context. Tasks marked as ready can be created immediately."
            showIcon
          />

          <div>
            <Title heading={6}>Tasks to Create ({tasks.length})</Title>
            <Space direction="vertical" style={{ width: '100%' }}>
              {tasks.map(task => (
                <Card
                  key={task.id}
                  size="small"
                  hoverable={task.status === 'pending' || task.status === 'ready'}
                  onClick={() => task.status !== 'created' && handleTaskClick(task.id)}
                  style={{
                    cursor: task.status === 'created' ? 'default' : 'pointer',
                    opacity: task.status === 'created' ? 0.7 : 1,
                  }}
                  title={
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Text style={{ fontWeight: 500 }}>{task.name}</Text>
                      <Space>
                        <Text
                          type="secondary"
                          style={{
                            color: getStatusColor(task.status),
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                        >
                          {getStatusText(task.status)}
                        </Text>
                        {task.needsMoreInfo && task.status === 'pending' && (
                          <IconQuestionCircle style={{ color: '#ff7d00' }} />
                        )}
                        {task.status === 'created' && (
                          <IconCheckCircle style={{ color: '#00b42a' }} />
                        )}
                      </Space>
                    </Space>
                  }
                >
                  <Text type="secondary" style={{ fontSize: 14 }}>
                    {task.description}
                  </Text>
                </Card>
              ))}
            </Space>
          </div>
        </Space>
      )}

      {currentStep === 'context' && selectedTask && (
        <div>
          <Title heading={6}>Provide Context for: {selectedTask.name}</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            Answer these questions to help AI better understand your task requirements.
          </Text>

          {isProcessing ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Spin size={40} />
              <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                Generating contextual questions...
              </Text>
            </div>
          ) : selectedTask.questions ? (
            <ContextForm
              questions={selectedTask.questions}
              onSubmit={handleAnswerSubmit}
            />
          ) : null}
        </div>
      )}

      {currentStep === 'enhance' && selectedTask && (
        <div>
          <Title heading={6}>AI Enhancements for: {selectedTask.name}</Title>

          {isProcessing ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Spin size={40} />
              <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                AI is analyzing and enhancing your task...
              </Text>
            </div>
          ) : selectedTask.enhancedSuggestions ? (
            <EnhancementView
              task={selectedTask}
              onCreateTask={(useEnhancements) => createTask(selectedTask, useEnhancements)}
              isCreating={isProcessing}
            />
          ) : null}
        </div>
      )}
    </Modal>
  )
}

// Context Form Component
function ContextForm({ questions, onSubmit }: {
  questions: ContextualQuestion[]
  onSubmit: (answers: Record<string, any>) => void
}) {
  const [form] = Form.useForm()

  const handleSubmit = async () => {
    try {
      const values = await form.validate()
      onSubmit(values)
    } catch (error) {
      // Form validation failed
    }
  }

  return (
    <Form form={form} layout="vertical">
      {questions.map((question, index) => (
        <Form.Item
          key={index}
          label={
            <Space>
              <Text>{question.question}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                ({question.purpose})
              </Text>
            </Space>
          }
          field={`question_${index}`}
          rules={[{ required: true, message: 'Please provide an answer' }]}
        >
          {question.type === 'text' && (
            <TextArea rows={2} />
          )}
          {question.type === 'number' && (
            <InputNumber style={{ width: '100%' }} />
          )}
          {question.type === 'choice' && question.choices && (
            <Select>
              {question.choices.map(choice => (
                <Select.Option key={choice} value={choice}>
                  {choice}
                </Select.Option>
              ))}
            </Select>
          )}
        </Form.Item>
      ))}

      <Form.Item>
        <Button type="primary" onClick={handleSubmit}>
          Continue with AI Enhancement
        </Button>
      </Form.Item>
    </Form>
  )
}

// Enhancement View Component
function EnhancementView({ task, onCreateTask, isCreating }: {
  task: TaskWithContext
  onCreateTask: (useEnhancements: boolean) => void
  isCreating: boolean
}) {
  const suggestions = task.enhancedSuggestions?.suggestions
  const confidence = task.enhancedSuggestions?.confidence || 0

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Alert
        type="info"
        content={`AI Confidence: ${confidence}% - Review the suggestions below and choose how to create your task.`}
        showIcon
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="Original Task" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text type="secondary" style={{ fontWeight: 'bold' }}>Description:</Text>
              <Text style={{ display: 'block' }}>{task.description}</Text>
            </div>
            <div>
              <Text style={{ fontWeight: 'bold' }}>Duration:</Text> {task.estimatedDuration} minutes
            </div>
            <div>
              <Text style={{ fontWeight: 'bold' }}>Priority:</Text> {task.importance} × {task.urgency} = {task.importance * task.urgency}
            </div>
            <div>
              <Text style={{ fontWeight: 'bold' }}>Type:</Text> {task.type}
            </div>
          </Space>
        </Card>

        <Card title="AI Suggestions" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            {suggestions?.description && (
              <div>
                <Text style={{ fontWeight: 'bold' }}>Enhanced Description:</Text>
                <Text style={{ display: 'block' }}>{suggestions.description}</Text>
              </div>
            )}
            {suggestions?.duration && (
              <div>
                <Text style={{ fontWeight: 'bold' }}>Suggested Duration:</Text> {suggestions.duration} minutes
              </div>
            )}
            {suggestions?.importance && suggestions?.urgency && (
              <div>
                <Text style={{ fontWeight: 'bold' }}>Suggested Priority:</Text> {suggestions.importance} × {suggestions.urgency} = {suggestions.importance * suggestions.urgency}
              </div>
            )}
            {suggestions?.type && (
              <div>
                <Text style={{ fontWeight: 'bold' }}>Suggested Type:</Text> {suggestions.type}
              </div>
            )}
            {suggestions?.tips && suggestions.tips.length > 0 && (
              <div>
                <Text style={{ fontWeight: 'bold' }}>Tips:</Text>
                <ul style={{ margin: '8px 0', paddingLeft: 16 }}>
                  {suggestions.tips.map((tip: string, index: number) => (
                    <li key={index}><Text style={{ fontSize: 14 }}>{tip}</Text></li>
                  ))}
                </ul>
              </div>
            )}
          </Space>
        </Card>
      </div>

      <div style={{ textAlign: 'center', paddingTop: 16 }}>
        <Space>
          <Button
            onClick={() => onCreateTask(false)}
            loading={isCreating}
          >
            Use Original
          </Button>
          <Button
            type="primary"
            onClick={() => onCreateTask(true)}
            loading={isCreating}
          >
            Use AI Suggestions
          </Button>
        </Space>
      </div>
    </Space>
  )
}
