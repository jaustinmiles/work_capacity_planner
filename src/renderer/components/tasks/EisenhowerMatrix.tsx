import { useState, useRef, useEffect, useCallback } from 'react'
import { TaskType } from '@shared/enums'
import { Card, Grid, Typography, Space, Tag, Empty, Button, Badge, Tooltip, Slider, Radio } from '@arco-design/web-react'
import { IconFire, IconCalendar, IconUser, IconClose, IconPlus, IconZoomIn, IconZoomOut, IconApps, IconDragDot, IconScan } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { Task } from '@shared/types'
import { getRendererLogger } from '../../../logging/index.renderer'
import { useContainerQuery } from '../../hooks/useContainerQuery'
import { useResponsive } from '../../providers/ResponsiveProvider'

const { Row, Col } = Grid
const { Title, Text } = Typography

interface EisenhowerMatrixProps {
  onAddTask: () => void
}

const logger = getRendererLogger().child({ category: 'eisenhower' })

export function EisenhowerMatrix({ onAddTask }: EisenhowerMatrixProps) {
  const { tasks, sequencedTasks, selectTask } = useTaskStore()
  const [zoom, setZoom] = useState(1)
  const [viewMode, setViewMode] = useState<'grid' | 'scatter'>('grid')
  const { ref: scatterContainerRef, width: containerWidth, height: containerHeight } = useContainerQuery<HTMLDivElement>()
  const { isCompact, isMobile } = useResponsive()
  const [containerSize, setContainerSize] = useState({ width: 500, height: 500 })

  // Diagonal scan state
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null)
  const [scannedTasks, setScannedTasks] = useState<Task[]>([])
  const scanAnimationRef = useRef<number | undefined>(undefined)

  // Update container size based on container query results
  useEffect(() => {
    if (containerWidth && containerHeight) {
      // Account for padding, but with responsive values
      const padding = isMobile ? 20 : isCompact ? 40 : 50
      const newSize = {
        width: Math.max(200, containerWidth - (padding * 2)),
        height: Math.max(200, Math.min(containerHeight - 100, 600)) // Cap height at 600px
      }
      
      // Only update if significantly different to avoid re-renders
      if (Math.abs(newSize.width - containerSize.width) > 10 || 
          Math.abs(newSize.height - containerSize.height) > 10) {
        setContainerSize(newSize)
        
        if (viewMode === 'scatter') {
          logger.debug('Container size updated (responsive)', {
            width: newSize.width,
            height: newSize.height,
            containerWidth,
            containerHeight,
            isMobile,
            isCompact
          })
        }
      }
    }
  }, [containerWidth, containerHeight, viewMode, isMobile, isCompact])

  // Combine regular tasks and sequenced tasks (workflows)
  // Deduplicate by ID - sequenced tasks take precedence
  const sequencedTaskIds = new Set(sequencedTasks.map(st => st.id))
  const dedupedTasks = tasks.filter(t => !sequencedTaskIds.has(t.id))

  const allTasks = [
    ...dedupedTasks,
    ...sequencedTasks.map(st => ({
      ...st,
      duration: st.duration, // Use totalDuration for sequenced tasks
    })),
  ]

  // Only show incomplete tasks in the matrix
  const incompleteTasks = allTasks.filter(task => !task.completed)

  // Log when scatter view is activated with full dataset analysis
  useEffect(() => {
    if (viewMode === 'scatter' && incompleteTasks.length > 0) {
      // Log scatter plot rendering for debugging
      logger.debug('EISENHOWER SCATTER DEBUG: Scatter plot rendering', {
        taskCount: incompleteTasks.length,
        containerWidth: containerSize.width,
        containerHeight: containerSize.height,
        firstTaskImportance: incompleteTasks[0]?.importance,
        firstTaskUrgency: incompleteTasks[0]?.urgency,
        hasWindowElectron: Boolean(window.electron),
        hasWindowElectronLog: Boolean(window.electron?.log),
      })
      const importanceValues = incompleteTasks.map(t => t.importance)
      const urgencyValues = incompleteTasks.map(t => t.urgency)

      // Check for Y-axis collapse
      const yPositions = incompleteTasks.map(t => (1 - t.importance / 10) * 100)
      const uniqueYPositions = new Set(yPositions)

      if (uniqueYPositions.size === 1 && incompleteTasks.length > 1) {
        logger.warn('Y-axis collapsed - all tasks have same Y position', {
          collapsedYValue: [...uniqueYPositions][0],
          taskCount: incompleteTasks.length,
          containerHeight: containerSize.height,
          importanceValues: [...new Set(importanceValues)],
        })
      }

      logger.info('Scatter view activated', {
        taskCount: incompleteTasks.length,
        importanceDistribution: {
          min: Math.min(...importanceValues),
          max: Math.max(...importanceValues),
          unique: [...new Set(importanceValues)].sort((a, b) => a - b),
          all: importanceValues,
        },
        urgencyDistribution: {
          min: Math.min(...urgencyValues),
          max: Math.max(...urgencyValues),
          unique: [...new Set(urgencyValues)].sort((a, b) => a - b),
          all: urgencyValues,
        },
        yPositionDistribution: {
          min: Math.min(...yPositions),
          max: Math.max(...yPositions),
          unique: [...new Set(yPositions)].sort((a, b) => a - b),
          count: new Set(yPositions).size,
          all: yPositions,
        },
        containerSize,
        timestamp: new Date().toISOString(),
      })

      // Warn if Y-axis appears collapsed
      if (new Set(yPositions).size === 1 && incompleteTasks.length > 1) {
        logger.warn('Y-axis collapsed in scatter view', {
          message: 'Y-axis is collapsed - all tasks have same Y position!',
          yPosition: yPositions[0],
          taskCount: incompleteTasks.length,
          importanceValues: [...new Set(importanceValues)],
        })
      }
    }
  }, [viewMode, incompleteTasks.length, containerSize.width, containerSize.height])

  // Categorize tasks into quadrants
  const categorizeTask = (task: Task) => {
    if (task.importance >= 7 && task.urgency >= 7) return 'do-first'
    if (task.importance >= 7 && task.urgency < 7) return 'schedule'
    if (task.importance < 7 && task.urgency >= 7) return 'delegate'
    return 'eliminate'
  }


  // Calculate perpendicular distance from point to scan line
  const getDistanceToScanLine = useCallback((task: Task, progress: number) => {
    // Scan line goes from top-right (width, 0) to bottom-left (0, height)
    // At progress p, the line is at:
    // Start point: (width * (1-p), 0)
    // End point: (width, height * p)

    // Convert task importance/urgency to pixel position
    const xPos = (task.urgency / 10) * containerSize.width
    const yPos = ((10 - task.importance) / 10) * containerSize.height // Inverted Y

    // Scan line endpoints at current progress
    const lineX1 = containerSize.width * (1 - progress)
    const lineY1 = 0
    const lineX2 = containerSize.width
    const lineY2 = containerSize.height * progress

    // Calculate perpendicular distance from point to line
    const A = lineY2 - lineY1
    const B = lineX1 - lineX2
    const C = lineX2 * lineY1 - lineX1 * lineY2

    const distance = Math.abs(A * xPos + B * yPos + C) / Math.sqrt(A * A + B * B)
    return distance
  }, [containerSize])

  // Start/stop diagonal scan animation
  const toggleDiagonalScan = useCallback(() => {
    if (isScanning) {
      // Stop scanning
      setIsScanning(false)
      setScanProgress(0)
      setHighlightedTaskId(null)
      if (scanAnimationRef.current) {
        window.cancelAnimationFrame(scanAnimationRef.current)
      }
    } else {
      // Start scanning - reset scanned tasks only when starting new scan
      setIsScanning(true)
      setScanProgress(0)
      setScannedTasks([])

      const scannedTaskIds = new Set<string>()
      let startTime: number | null = null
      const animationDuration = 8000 // 8 seconds for full scan
      const scanThreshold = 30 // Pixels distance to consider "hit" by scan line

      const animate = (timestamp: number) => {
        if (!startTime) startTime = timestamp
        const elapsed = timestamp - startTime

        // Calculate progress (0 to 1)
        const progress = Math.min(elapsed / animationDuration, 1)
        setScanProgress(progress)

        // Find tasks that are currently hit by the scan line
        let currentHighlightedTask: Task | null = null

        incompleteTasks.forEach((task: Task) => {
          const distance = getDistanceToScanLine(task, progress)

          // Check if scan line is hitting this task
          if (distance < scanThreshold) {
            // Add to scanned tasks if not already added
            if (!scannedTaskIds.has(task.id)) {
              scannedTaskIds.add(task.id)
              setScannedTasks(prev => [...prev, task])
            }

            // Highlight the task closest to the scan line
            if (!currentHighlightedTask || distance < getDistanceToScanLine(currentHighlightedTask as Task, progress)) {
              currentHighlightedTask = task
            }
          }
        })

        // Update highlighted task
        if (currentHighlightedTask !== null) {
          const highlightedTask = currentHighlightedTask as Task
          setHighlightedTaskId(highlightedTask.id)
          selectTask(highlightedTask.id)
        } else {
          setHighlightedTaskId(null)
        }

        if (progress < 1) {
          scanAnimationRef.current = window.requestAnimationFrame(animate)
        } else {
          // Keep list visible when complete - don't reset
          setIsScanning(false)
          setScanProgress(0)
          setHighlightedTaskId(null)
        }
      }

      scanAnimationRef.current = window.requestAnimationFrame(animate)
    }
  }, [isScanning, incompleteTasks, selectTask, getDistanceToScanLine])

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (scanAnimationRef.current) {
        window.cancelAnimationFrame(scanAnimationRef.current)
      }
    }
  }, [])

  const quadrants = {
    'do-first': incompleteTasks.filter(task => categorizeTask(task) === 'do-first'),
    'schedule': incompleteTasks.filter(task => categorizeTask(task) === 'schedule'),
    'delegate': incompleteTasks.filter(task => categorizeTask(task) === 'delegate'),
    'eliminate': incompleteTasks.filter(task => categorizeTask(task) === 'eliminate'),
  }

  const quadrantConfig = {
    'do-first': {
      title: 'Do First',
      subtitle: 'Important & Urgent',
      icon: <IconFire />,
      color: '#F53F3F',
      bgColor: '#FFECE8',
      description: 'Critical tasks requiring immediate attention',
    },
    'schedule': {
      title: 'Schedule',
      subtitle: 'Important & Not Urgent',
      icon: <IconCalendar />,
      color: '#165DFF',
      bgColor: '#E8F3FF',
      description: 'Strategic tasks to plan and execute',
    },
    'delegate': {
      title: 'Delegate',
      subtitle: 'Not Important & Urgent',
      icon: <IconUser />,
      color: '#FF7D00',
      bgColor: '#FFF7E8',
      description: 'Tasks that can be assigned to others',
    },
    'eliminate': {
      title: 'Eliminate',
      subtitle: 'Not Important & Not Urgent',
      icon: <IconClose />,
      color: '#86909C',
      bgColor: '#F7F8FA',
      description: 'Low priority tasks to minimize',
    },
  }

  const TaskCard = ({ task, color }: { task: Task; color: string }) => {
    // Check if this is a sequenced task (workflow)
    const isWorkflow = sequencedTasks.some(st => st.id === task.id)

    return (
      <Card
        hoverable
        style={{
          cursor: 'pointer',
          marginBottom: 8,
          border: `1px solid ${color}20`,
        }}
        onClick={() => selectTask(task.id)}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={4}>
          <Text style={{ fontWeight: 500 }}>{task.name}</Text>
          <Space size="small">
            {isWorkflow && (
              <Tag size="small" color="purple">
                Workflow
              </Tag>
            )}
            <Tag size="small" color={task.type === TaskType.Focused ? 'blue' : 'green'}>
              {task.type === TaskType.Focused ? 'Focused' : 'Admin'}
            </Tag>
            <Tag size="small">
              {Math.floor(task.duration / 60)}h {task.duration % 60}m
            </Tag>
          </Space>
        </Space>
      </Card>
    )
  }

  const QuadrantCard = ({ quadrant }: { quadrant: keyof typeof quadrants }) => {
    const config = quadrantConfig[quadrant]
    const tasks = quadrants[quadrant]

    return (
      <Card
        style={{
          height: '100%',
          background: config.bgColor,
          border: `2px solid ${config.color}20`,
        }}
      >
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Space style={{ marginBottom: 16 }}>
            <div style={{ color: config.color, fontSize: 20 }}>
              {config.icon}
            </div>
            <div>
              <Title heading={6} style={{ margin: 0, color: config.color }}>
                {config.title}
                <Badge count={tasks.length} style={{ marginLeft: 8 }} />
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {config.subtitle}
              </Text>
            </div>
          </Space>

          <Tooltip content={config.description}>
            <Text type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
              {config.description}
            </Text>
          </Tooltip>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {tasks.length === 0 ? (
              <Empty
                description={<Text type="secondary">No tasks in this quadrant</Text>}
                style={{ marginTop: 40 }}
              />
            ) : (
              tasks.map(task => (
                <TaskCard key={task.id} task={task} color={config.color} />
              ))
            )}
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Header with Add Task Button and Zoom Controls */}
      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title heading={5} style={{ margin: 0 }}>
              Eisenhower Priority Matrix
            </Title>
            <Text type="secondary">
              Organize tasks by importance and urgency to focus on what matters most
            </Text>
          </div>
          <Space>
            <Radio.Group
              type="button"
              value={viewMode}
              onChange={setViewMode}
              size="small"
            >
              <Radio value="grid">
                <IconApps /> Grid
              </Radio>
              <Radio value="scatter">
                <IconDragDot /> Scatter
              </Radio>
            </Radio.Group>
            {viewMode === 'scatter' && (
              <Button
                // Arco Design button types: 'primary' (blue, prominent), 'default' (gray, standard)
                type={isScanning ? 'primary' : 'default'}
                icon={<IconScan />}
                onClick={toggleDiagonalScan}
                loading={isScanning}
              >
                {isScanning ? 'Scanning...' : 'Diagonal Scan'}
              </Button>
            )}
            <Space>
              <Button icon={<IconZoomOut />} onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} />
              <Slider
                value={zoom}
                onChange={(val) => setZoom(Array.isArray(val) ? val[0] : val)}
                min={0.5}
                max={2}
                step={0.1}
                style={{ width: 120 }}
                formatTooltip={(val) => `${Math.round(val * 100)}%`}
              />
              <Button icon={<IconZoomIn />} onClick={() => setZoom(Math.min(2, zoom + 0.1))} />
            </Space>
            <Button type="primary" icon={<IconPlus />} onClick={onAddTask}>
              Add Task
            </Button>
          </Space>
        </Space>
      </Card>

      {/* Matrix View */}
      {viewMode === 'grid' ? (
        <div style={{
        position: 'relative',
        overflow: 'auto',
        maxHeight: 'calc(100vh - 300px)',
        border: '1px solid #e5e6eb',
        borderRadius: 4,
        padding: 16,
      }}>
        <div style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          width: `${100 / zoom}%`,
        }}>
          {/* Axis Labels */}
          <div style={{
            position: 'absolute',
            top: -30,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1,
          }}>
            <Text type="secondary" style={{ fontWeight: 500 }}>
              ← Less Urgent ——— More Urgent →
            </Text>
          </div>

          <div style={{
            position: 'absolute',
            left: -140,
            top: '50%',
            transform: 'translateY(-50%) rotate(-90deg)',
            zIndex: 1,
          }}>
            <Text type="secondary" style={{ fontWeight: 500 }}>
              ← Less Important ——— More Important →
            </Text>
          </div>

          {/* Quadrants */}
          <Row gutter={24} style={{ marginTop: 40, marginLeft: 40 }}>
            <Col span={12}>
              <Row gutter={[24, 24]}>
                <Col span={24} style={{ minHeight: 400 }}>
                  <QuadrantCard quadrant="schedule" />
                </Col>
                <Col span={24} style={{ minHeight: 400 }}>
                  <QuadrantCard quadrant="eliminate" />
                </Col>
              </Row>
            </Col>
            <Col span={12}>
              <Row gutter={[24, 24]}>
                <Col span={24} style={{ minHeight: 400 }}>
                  <QuadrantCard quadrant="do-first" />
                </Col>
                <Col span={24} style={{ minHeight: 400 }}>
                  <QuadrantCard quadrant="delegate" />
                </Col>
              </Row>
            </Col>
          </Row>
        </div>
      </div>
      ) : (
        // Scatter Plot View
        <Card style={{ minHeight: isMobile ? 400 : 500, height: isMobile ? 'auto' : 600, position: 'relative', overflow: 'hidden' }}>
          <div ref={scatterContainerRef} className="eisenhower-scatter-container" style={{
            width: '100%',
            height: '100%',
            minHeight: isMobile ? 300 : 400,
            maxHeight: isMobile ? 400 : 600,
            position: 'relative',
            padding: isMobile ? '20px' : isCompact ? '30px' : '50px',
          }}>
            {/* Axis Labels */}
            <Text
              type="secondary"
              style={{
                position: 'absolute',
                bottom: 10,
                left: '50%',
                transform: 'translateX(-50%)',
                fontWeight: 500,
              }}
            >
              Urgency →
            </Text>
            <Text
              type="secondary"
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%) rotate(-90deg)',
                fontWeight: 500,
              }}
            >
              Importance →
            </Text>

            {/* Grid Lines and Quadrant Labels */}
            <div style={{
              position: 'absolute',
              top: 50,
              left: 50,
              right: 50,
              bottom: 50,
              border: '2px solid #e5e6eb',
              background: 'white',
            }}>
              {/* Vertical Center Line */}
              <div style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                bottom: 0,
                width: 2,
                background: '#e5e6eb',
              }} />
              {/* Horizontal Center Line */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: 0,
                right: 0,
                height: 2,
                background: '#e5e6eb',
              }} />

              {/* Quadrant Labels */}
              <Text style={{
                position: 'absolute',
                top: 10,
                right: 10,
                color: quadrantConfig['do-first'].color,
                fontWeight: 500,
                background: 'white',
                padding: '2px 8px',
              }}>
                Do First
              </Text>
              <Text style={{
                position: 'absolute',
                top: 10,
                left: 10,
                color: quadrantConfig['schedule'].color,
                fontWeight: 500,
                background: 'white',
                padding: '2px 8px',
              }}>
                Schedule
              </Text>
              <Text style={{
                position: 'absolute',
                bottom: 10,
                right: 10,
                color: quadrantConfig['delegate'].color,
                fontWeight: 500,
                background: 'white',
                padding: '2px 8px',
              }}>
                Delegate
              </Text>
              <Text style={{
                position: 'absolute',
                bottom: 10,
                left: 10,
                color: quadrantConfig['eliminate'].color,
                fontWeight: 500,
                background: 'white',
                padding: '2px 8px',
              }}>
                Eliminate
              </Text>
            </div>

            {/* Diagonal Scan Line Animation */}
            {isScanning && (
              <div
                data-testid="diagonal-scan-line"
                style={{
                  position: 'absolute',
                  top: 50,
                  left: 50,
                  width: containerSize.width,
                  height: containerSize.height,
                  pointerEvents: 'none',
                  overflow: 'visible',
                }}
              >
                {/* Animated diagonal line */}
                <svg
                  width={containerSize.width}
                  height={containerSize.height}
                  style={{ position: 'absolute', top: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="scan-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#165DFF" stopOpacity="0" />
                      <stop offset="50%" stopColor="#165DFF" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#165DFF" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <line
                    x1={containerSize.width * (1 - scanProgress)}
                    y1={0}
                    x2={containerSize.width}
                    y2={containerSize.height * scanProgress}
                    stroke="url(#scan-gradient)"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  {/* Scanning wave effect */}
                  <circle
                    cx={containerSize.width - (containerSize.width * scanProgress)}
                    cy={containerSize.height * scanProgress}
                    r="20"
                    fill="none"
                    stroke="#165DFF"
                    strokeWidth="2"
                    opacity={0.6}
                  >
                    <animate
                      attributeName="r"
                      from="10"
                      to="40"
                      dur="1s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      from="0.8"
                      to="0"
                      dur="1s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </svg>
              </div>
            )}

            {/* Task Points - Outside the grid container */}
            {/* Only render points when container has valid dimensions */}
            {(() => {
              // Debug why nothing is showing
              if (containerSize.height <= 0) {
                logger.error('EISENHOWER RENDER BLOCKED: Container height is zero or negative', {
                  containerHeight: containerSize.height,
                  containerWidth: containerSize.width,
                  taskCount: incompleteTasks.length,
                })
                return null
              }
              // Group tasks by position to detect clusters
              const taskClusters = new Map<string, typeof incompleteTasks>()
              incompleteTasks.forEach(task => {
                const xPercent = Math.round((task.urgency / 10) * 100)
                const yPercent = Math.round((1 - task.importance / 10) * 100)
                const posKey = `${xPercent}-${yPercent}`

                const cluster = taskClusters.get(posKey) || []
                cluster.push(task)
                taskClusters.set(posKey, cluster)
              })

              // Create a Set of tasks that are part of clusters (for hiding duplicates)
              const renderedTasks = new Set<string>()
              const clusterElements: React.ReactNode[] = []

              // First pass: render cluster indicators
              taskClusters.forEach((tasksAtPosition, posKey) => {
                if (tasksAtPosition.length > 1) {
                  const [xStr, yStr] = posKey.split('-')
                  const xPercent = parseInt(xStr)
                  const yPercent = parseInt(yStr)

                  // Add all but first task to rendered set (we'll show them in the cluster)
                  tasksAtPosition.slice(1).forEach(t => renderedTasks.add(t.id))

                  // Get the dominant quadrant color
                  const quadrant = categorizeTask(tasksAtPosition[0])
                  const config = quadrantConfig[quadrant]

                  clusterElements.push(
                    <Tooltip
                      key={`cluster-${posKey}`}
                      content={
                        <div>
                          {tasksAtPosition.map(t => (
                            <div key={t.id} style={{ marginBottom: 4 }}>
                              • {t.name}
                            </div>
                          ))}
                        </div>
                      }
                    >
                      <div
                        style={{
                          position: 'absolute',
                          left: 50 + (xPercent / 100) * (containerSize.width - 100),
                          top: 50 + (yPercent / 100) * (containerSize.height - 100),
                          transform: 'translate(-50%, -50%)',
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: config.color,
                          border: '3px solid white',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: 'bold',
                          fontSize: 14,
                          cursor: 'pointer',
                          zIndex: 10,
                        }}
                        onClick={() => {
                          // Could expand to show all tasks on click
                          console.log('Cluster clicked:', tasksAtPosition)
                        }}
                      >
                        {tasksAtPosition.length}
                      </div>
                    </Tooltip>,
                  )
                }
              })

              return (
                <>
                  {incompleteTasks.filter(task => !renderedTasks.has(task.id)).map((task) => {
                const isWorkflow = sequencedTasks.some(st => st.id === task.id)
                const quadrant = categorizeTask(task)
                const config = quadrantConfig[quadrant]
                const isHighlighted = task.id === highlightedTaskId

                // Convert importance/urgency (1-10) to position (0-100%)
                const xPercent = (task.urgency / 10) * 100
                const yPercent = (1 - task.importance / 10) * 100 // Invert Y axis (high importance at top)

                // Detailed debug logging for Y-axis collapse investigation
                logger.debug('Task position calculated', {
                  taskId: task.id,
                  taskName: task.name,
                  importance: task.importance,
                  urgency: task.urgency,
                  importanceType: typeof task.importance,
                  urgencyType: typeof task.urgency,
                  xPercent,
                  yPercent,
                  xPos: 50 + (xPercent / 100) * containerSize.width,
                  yPos: 50 + (yPercent / 100) * containerSize.height,
                  containerWidth: containerSize.width,
                  containerHeight: containerSize.height,
                  isNaN: {
                    importance: isNaN(task.importance),
                    urgency: isNaN(task.urgency),
                    xPercent: isNaN(xPercent),
                    yPercent: isNaN(yPercent),
                  },
                  calculation: {
                    step1: `importance=${task.importance}`,
                    step2: `importance/10=${task.importance / 10}`,
                    step3: `1 - importance/10=${1 - task.importance / 10}`,
                    step4: `(1 - importance/10) * 100=${(1 - task.importance / 10) * 100}`,
                  },
                })

                // Calculate bubble size based on duration (min 20px, max 60px)
                const baseSize = Math.min(60, Math.max(20, 20 + (task.duration / 30)))
                const size = isHighlighted ? baseSize * 1.3 : baseSize

                // Use actual container dimensions for positioning
                const xPos = 50 + (xPercent / 100) * containerSize.width
                const yPos = 50 + (yPercent / 100) * containerSize.height

                return (
                  <Tooltip
                    key={task.id}
                    content={
                      <Space direction="vertical">
                        <Text style={{ fontWeight: 500 }}>{task.name}</Text>
                        <Space size="small">
                          <Tag size="small">I: {task.importance}</Tag>
                          <Tag size="small">U: {task.urgency}</Tag>
                          <Tag size="small">{Math.floor(task.duration / 60)}h {task.duration % 60}m</Tag>
                        </Space>
                      </Space>
                    }
                  >
                    <div
                      onClick={() => selectTask(task.id)}
                      style={{
                        position: 'absolute',
                        left: xPos,
                        top: yPos,
                        transform: `translate(-50%, -50%) scale(${zoom})`,
                        width: size,
                        height: size,
                        borderRadius: '50%',
                        background: isHighlighted
                          ? `linear-gradient(135deg, ${config.color}, ${config.color}dd)`
                          : config.color,
                        opacity: isHighlighted ? 1 : 0.8,
                        border: isWorkflow ? '3px solid purple' : 'none',
                        boxShadow: isHighlighted ? `0 0 20px ${config.color}` : 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'transform 0.3s, opacity 0.3s, box-shadow 0.3s, background 0.3s',
                        zIndex: isHighlighted ? 20 : 10,
                      }}
                      onMouseEnter={(e) => {
                        if (!isHighlighted) {
                          e.currentTarget.style.opacity = '1'
                          e.currentTarget.style.transform = `translate(-50%, -50%) scale(${zoom * 1.1})`
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isHighlighted) {
                          e.currentTarget.style.opacity = '0.8'
                          e.currentTarget.style.transform = `translate(-50%, -50%) scale(${zoom})`
                        }
                      }}
                    >
                      <div style={{
                        color: 'white',
                        fontSize: 9,
                        fontWeight: 500,
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <div>{task.importance}/{task.urgency}</div>
                        <div style={{ fontSize: 7 }}>{task.name.substring(0, 3)}</div>
                      </div>
                    </div>
                  </Tooltip>
                )
              })}
              {clusterElements}
            </>
            )
            })()}
          </div>
        </Card>
      )}

      {/* Scanned Tasks List - Only show in scatter view when tasks have been scanned */}
      {viewMode === 'scatter' && scannedTasks.length > 0 && (
        <Card
          title={
            <Space>
              <IconScan style={{ fontSize: 18 }} />
              <Text style={{ fontWeight: 500 }}>
                Eisenhower Priority Order ({scannedTasks.length} tasks)
              </Text>
            </Space>
          }
          style={{ background: '#FAFBFC' }}
        >
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {scannedTasks.map((task, index) => (
                <div
                  key={task.id}
                  onClick={() => selectTask(task.id)}
                  style={{
                    padding: '8px 12px',
                    background: 'white',
                    border: '1px solid #E5E6EB',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#F7F8FA'
                    e.currentTarget.style.borderColor = '#C9CDD4'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white'
                    e.currentTarget.style.borderColor = '#E5E6EB'
                  }}
                >
                  <Text type="secondary" style={{ minWidth: 24 }}>
                    {index + 1}.
                  </Text>
                  <Text style={{ flex: 1 }}>{task.name}</Text>
                  <Space size="small">
                    <Tag size="small" color={quadrantConfig[categorizeTask(task)].color}>
                      {quadrantConfig[categorizeTask(task)].title}
                    </Tag>
                  </Space>
                </div>
              ))}
            </Space>
          </div>
        </Card>
      )}

      {/* Info Footer */}
      <Card style={{ background: '#F7F8FA' }}>
        <Text type="secondary">
          Tasks are automatically categorized based on their importance and urgency scores.
          Scores of 7 or higher are considered high priority.
        </Text>
      </Card>
    </Space>
  )
}
