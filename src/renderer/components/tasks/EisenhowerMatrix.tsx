import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
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
  const [debugMode, setDebugMode] = useState(false) // Debug mode off by default

  // Calculate responsive padding
  const PADDING_MOBILE = 20
  const PADDING_COMPACT = 40
  const PADDING_DESKTOP = 50
  const padding = isMobile ? PADDING_MOBILE : isCompact ? PADDING_COMPACT : PADDING_DESKTOP

  // Diagonal scan state
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [_highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null)
  const [scannedTasks, setScannedTasks] = useState<Task[]>([])
  const scanAnimationRef = useRef<number | undefined>(undefined)

  // Update container size based on container query results
  useEffect(() => {
    logger.warn('🔄 [SCATTER] Container resize detected', {
      measured: { width: containerWidth, height: containerHeight },
      current: containerSize,
      hasValidDimensions: !!(containerWidth && containerHeight),
      padding,
      viewMode,
      timestamp: Date.now(),
    })

    // Use measured dimensions or fallback to reasonable defaults
    const effectiveWidth = containerWidth || 800
    const effectiveHeight = containerHeight || 600

    if (effectiveWidth > 0 && effectiveHeight > 0) {
      // Don't subtract padding from container - we handle it in positioning
      const newSize = {
        width: Math.max(300, effectiveWidth),
        height: Math.max(300, Math.min(effectiveHeight, 600)), // Cap height at 600px
      }

      const needsUpdate = Math.abs(newSize.width - containerSize.width) > 10 ||
                         Math.abs(newSize.height - containerSize.height) > 10

      logger.info('📐 [SCATTER] Size calculation', {
        input: { containerWidth, containerHeight },
        padding,
        calculated: newSize,
        current: containerSize,
        difference: {
          width: newSize.width - containerSize.width,
          height: newSize.height - containerSize.height,
        },
        needsUpdate,
        gridSize: {
          width: newSize.width - padding * 2,
          height: newSize.height - padding * 2,
        },
      })

      // Only update if significantly different to avoid re-renders
      if (needsUpdate) {
        setContainerSize(newSize)

        if (viewMode === 'scatter') {
          logger.info('✅ [SCATTER] Container size UPDATED', {
            newSize,
            gridArea: {
              left: padding,
              top: padding,
              width: newSize.width - padding * 2,
              height: newSize.height - padding * 2,
            },
            coordinateSpace: {
              xAxis: '0-10 (urgency)',
              yAxis: '10-0 (importance inverted)',
              origin: { x: padding, y: padding },
              max: { x: newSize.width - padding, y: newSize.height - padding },
            },
            responsive: { isMobile, isCompact },
          })
        }
      } else {
        logger.debug('⏸️ [SCATTER] Size update skipped (difference < 10px)')
      }
    }
  }, [containerWidth, containerHeight, viewMode, isMobile, isCompact, padding])

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

  // For scatter plot, also include workflow steps as individual items
  const allItemsForScatter = useMemo(() => {
    const items: Array<Task & { isStep?: boolean; parentWorkflow?: string; stepName?: string; stepIndex?: number }> = []

    // Add regular tasks and workflows
    incompleteTasks.forEach(task => {
      items.push(task)

      // If it's a workflow, also add its steps
      const sequencedTask = sequencedTasks.find(st => st.id === task.id)
      if (sequencedTask?.steps) {
        sequencedTask.steps.forEach((step, index) => {
          // Create a task-like object for each step
          items.push({
            ...task, // Inherit parent task properties
            id: step.id,
            name: `${task.name} - ${step.name}`,
            duration: step.duration,
            importance: step.importance ?? task.importance,
            urgency: step.urgency ?? task.urgency,
            completed: step.status === 'completed',
            isStep: true,
            parentWorkflow: task.id,
            stepName: step.name,
            stepIndex: index,
          })
        })
      }
    })

    // Filter out completed steps
    return items.filter(item => !item.completed)
  }, [incompleteTasks, sequencedTasks])

  // Calculate grid dimensions (used in multiple places)
  const gridWidth = containerSize.width - padding * 2
  const gridHeight = containerSize.height - padding * 2

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
      const animationDuration = 4000 // 4 seconds for full scan - faster!
      const scanThreshold = 30 // Pixels distance to consider "hit" by scan line

      // Use allItemsForScatter when in scatter view to include steps
      const itemsToScan = viewMode === 'scatter' ? allItemsForScatter : incompleteTasks

      const animate = (timestamp: number) => {
        if (!startTime) startTime = timestamp
        const elapsed = timestamp - startTime

        // Calculate progress (0 to 2.0) - MUST reach bottom-left corner (0,0) Eisenhower coordinates
        // which is at (0%, 100%) SVG coordinates, requiring progress = 2.0
        const rawProgress = elapsed / animationDuration
        const progress = Math.min(rawProgress, 2.0) // Continue until line reaches (0%, 100%)
        setScanProgress(progress)

        // Debug logging for animation progress
        if (progress % 0.1 < 0.02) { // Log every ~10% progress
          logger.debug('Diagonal scan progress', {
            progress: Math.round(progress * 100) / 100,
            elapsed: elapsed,
            duration: animationDuration,
            scannedCount: scannedTaskIds.size,
          })
        }

        // Find tasks that are currently hit by the scan line
        let currentHighlightedTask: Task | null = null

        itemsToScan.forEach((task: Task) => {
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
          const isStep = (highlightedTask as any).isStep
          selectTask(isStep ? (highlightedTask as any).parentWorkflow : highlightedTask.id)
        } else {
          setHighlightedTaskId(null)
        }

        if (progress < 2.0) { // Run until line reaches bottom-left corner (0%, 100%)
          scanAnimationRef.current = window.requestAnimationFrame(animate)
        } else {
          // Animation complete - log final results
          logger.info('Diagonal scan completed', {
            totalScanned: scannedTaskIds.size,
            animationDuration: elapsed,
            finalProgress: progress,
          })

          // Keep list visible when complete - don't reset
          setIsScanning(false)
          setScanProgress(0)
          setHighlightedTaskId(null)
        }
      }

      scanAnimationRef.current = window.requestAnimationFrame(animate)
    }
  }, [isScanning, incompleteTasks, allItemsForScatter, viewMode, selectTask, getDistanceToScanLine])

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

          <div style={{ flex: 1, minHeight: 0 }}>
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
    <Space 
      direction="vertical" 
      style={{ 
        width: '100%',
        minWidth: 400, // Prevent catastrophic narrowing that breaks text rendering
      }} 
      size="large"
    >
      {/* Header with Add Task Button and Zoom Controls */}
      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ 
            minWidth: 300, // Prevent extreme narrowing that causes character wrapping
            flex: '1 1 auto', // Allow growth but maintain minimum width
          }}>
            <Title 
              heading={5} 
              style={{ 
                margin: 0,
                whiteSpace: 'nowrap', // Force single line
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 200, // Ensure adequate space for title
              }}
            >
              Eisenhower Priority Matrix
            </Title>
            <Text 
              type="secondary"
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden', 
                textOverflow: 'ellipsis',
                display: 'block',
                maxWidth: 400, // Prevent subtitle from getting too wide
              }}
            >
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
        <Card style={{ position: 'relative', overflow: 'hidden', padding: 0 }}>
          <div ref={scatterContainerRef} className="eisenhower-scatter-container" style={{
            width: '100%',
            height: isMobile ? 450 : 650,
            minHeight: isMobile ? 450 : 650,
            maxHeight: 800,
            position: 'relative',
            overflow: 'hidden',
            background: '#fafbfc',
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
              top: padding,
              left: padding,
              right: padding,
              bottom: padding,
              border: '2px solid #e5e6eb',
              background: 'white',
            }}>
              {/* Tasks and clusters will be positioned within this grid box */}
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

              {/* Debug Marker at 5,5 (center point) */}
              <div style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: '3px solid red',
                background: 'rgba(255, 0, 0, 0.2)',
                zIndex: 100,
                pointerEvents: 'none',
              }} title="5,5 Reference Point" />

              {/* X-Axis value labels (Urgency: 0-10) */}
              {[0, 2.5, 5, 7.5, 10].map((val) => {
                const xPos = (val / 10) * 100
                logger.debug('📏 [AXIS] X-axis label', { value: val, position: `${xPos}%` })
                return (
                  <div key={`x-label-${val}`} style={{
                    position: 'absolute',
                    left: `${xPos}%`,
                    bottom: -20,
                    transform: 'translateX(-50%)',
                    fontSize: 10,
                    color: '#999',
                  }}>{val}</div>
                )
              })}

              {/* Y-Axis value labels (Importance: 10-0 inverted) */}
              {[10, 7.5, 5, 2.5, 0].map((val) => {
                const yPos = ((10 - val) / 10) * 100
                logger.debug('📏 [AXIS] Y-axis label', { value: val, position: `${yPos}%` })
                return (
                  <div key={`y-label-${val}`} style={{
                    position: 'absolute',
                    right: -20,
                    top: `${yPos}%`,
                    transform: 'translateY(-50%)',
                    fontSize: 10,
                    color: '#999',
                  }}>{val}</div>
                )
              })}

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

              {/* Task Points - RESPONSIVE with percentage positioning */}
              {(() => {
                if (containerSize.height <= 0 || containerSize.width <= 0) {
                  return null
                }

                // Use allItemsForScatter to include workflow steps
                const itemsToRender = allItemsForScatter

                return itemsToRender.map((task) => {
                  // Calculate percentage positions (0-100%)
                  const xPercent = (task.urgency / 10) * 100
                  const yPercent = (1 - task.importance / 10) * 100

                  // Size based on duration, responsive to container
                  const baseSize = Math.min(40, Math.max(20, 20 + (task.duration / 60)))
                  // Scale size based on container width, but maintain minimum size
                  const scaleFactor = Math.min(1.5, Math.max(0.8, containerSize.width / 800))
                  const responsiveSize = Math.max(20, Math.round(baseSize * scaleFactor))

                  logger.debug(`📍 [TASK] "${task.name}" render position`, {
                    importance: task.importance,
                    urgency: task.urgency,
                    xPercent: `${xPercent}%`,
                    yPercent: `${yPercent}%`,
                    size: `${responsiveSize}px`,
                    containerSize: { width: containerSize.width, height: containerSize.height },
                  })

                  const isStep = (task as any).isStep
                  const stepIndex = (task as any).stepIndex

                  return (
                    <div
                      key={task.id}
                      onClick={() => selectTask(isStep ? (task as any).parentWorkflow : task.id)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1'
                        e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.1)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = isStep ? '0.7' : '0.8'
                        e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)'
                      }}
                      style={{
                        position: 'absolute',
                        left: `${xPercent}%`,
                        top: `${yPercent}%`,
                        transform: 'translate(-50%, -50%)',
                        width: `${responsiveSize}px`,
                        height: `${responsiveSize}px`,
                        aspectRatio: '1 / 1',
                        borderRadius: isStep ? '40%' : '50%', // Steps are slightly less round
                        background: categorizeTask(task) === 'do-first' ? '#F53F3F' :
                                   categorizeTask(task) === 'schedule' ? '#165DFF' :
                                   categorizeTask(task) === 'delegate' ? '#FF7D00' : '#86909C',
                        opacity: isStep ? 0.7 : 0.8, // Steps are slightly more transparent
                        cursor: 'pointer',
                        zIndex: isStep ? 9 : 10, // Steps behind tasks
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: isStep ? '0.55rem' : '0.625rem',
                        fontWeight: 'bold',
                        border: isStep ? '2px dashed rgba(255,255,255,0.8)' : '2px solid white', // Dashed border for steps
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                        minWidth: '30px',
                        minHeight: '30px',
                        transition: 'all 0.2s ease',
                      }}
                      title={`${task.name} (I:${task.importance} U:${task.urgency})${isStep ? ` [Step ${stepIndex + 1}]` : ''}`}
                    >
                      {isStep ? `S${stepIndex + 1}` : task.name.slice(0, 3).toUpperCase()}
                    </div>
                  )
                })
              })()}
            </div>

            {/* Diagonal Scan Line Animation - RESPONSIVE */}
            {isScanning && (
              <div
                data-testid="diagonal-scan-line"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  overflow: 'visible',
                }}
              >
                {/* Animated diagonal line - use percentages */}
                <svg
                  width="100%"
                  height="100%"
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
                    x1={`${100 * (1 - scanProgress)}%`} // Moving start point (sweeps left to right)
                    y1="0%"                              // Top edge
                    x2="100%"                            // Right edge (fixed)
                    y2={`${100 * scanProgress}%`}        // Moving down (sweeps top to bottom)
                    stroke="url(#scan-gradient)"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            )}

            {/* Debug Overlay - Shows coordinate system details */}
            {debugMode && containerSize.width > 0 && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 1000,
              }}>
                {/* Debug Grid Lines every 10% - RESPONSIVE */}
                <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => {
                    // Use percentage-based positioning for responsiveness
                    const xPercent = (i * 10) // 0%, 10%, 20%, ... 100%
                    const yPercent = (i * 10) // 0%, 10%, 20%, ... 100%

                    // Calculate actual pixel positions for logging
                    const xPixel = (xPercent / 100) * containerSize.width
                    const yPixel = (yPercent / 100) * containerSize.height

                    const xAxisValue = i // Urgency: 0-10 left to right
                    const yAxisValue = 10 - i // Importance: 10-0 top to bottom (inverted)

                    logger.debug(`📊 [AXIS] Grid line ${i}`, {
                      xAxis: { value: xAxisValue, pixel: xPixel, percent: xPercent, label: `U:${xAxisValue}` },
                      yAxis: { value: yAxisValue, pixel: yPixel, percent: yPercent, label: `I:${yAxisValue}` },
                      containerSize: { width: containerSize.width, height: containerSize.height },
                    })

                    return (
                      <g key={`debug-grid-${i}`}>
                      {/* Vertical lines - use percentages */}
                      <line
                        x1={`${xPercent}%`}
                        y1="0%"
                        x2={`${xPercent}%`}
                        y2="100%"
                        stroke="rgba(255, 0, 255, 0.2)"
                        strokeDasharray="2 2"
                      />
                      <text
                        x={`${xPercent}%`}
                        y="5"
                        fill="magenta"
                        fontSize="10"
                        textAnchor="middle"
                      >
                        U:{i}
                      </text>
                      {/* Horizontal lines - use percentages */}
                      <line
                        x1="0%"
                        y1={`${yPercent}%`}
                        x2="100%"
                        y2={`${yPercent}%`}
                        stroke="rgba(255, 0, 255, 0.2)"
                        strokeDasharray="2 2"
                      />
                      <text
                        x="5"
                        y={`${yPercent}%`}
                        fill="magenta"
                        fontSize="10"
                        textAnchor="start"
                        alignmentBaseline="middle"
                      >
                        I:{10-i}
                      </text>
                    </g>
                  )
                })}
                </svg>

                {/* Debug Info Panel - Stays within container bounds */}
                <div style={{
                  position: 'absolute',
                  top: '2%',
                  right: '2%',
                  background: 'rgba(255, 255, 255, 0.95)',
                  border: '2px solid magenta',
                  padding: '10px',
                  borderRadius: '5px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  maxWidth: '40%',
                  maxHeight: '40%',
                  overflow: 'auto',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  zIndex: 1500,
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 5, color: 'magenta' }}>
                    🔍 SCATTER PLOT DEBUG MODE
                  </div>
                  <div>Container: {containerSize.width}x{containerSize.height}px</div>
                  <div>Measured: {containerWidth?.toFixed(0) || '?'}x{containerHeight?.toFixed(0) || '?'}px</div>
                  <div>Padding: {padding}px</div>
                  <div>Grid: {gridWidth}x{gridHeight}px</div>
                  <div>Tasks: {incompleteTasks.length}</div>
                  <div style={{ marginTop: 5, fontWeight: 'bold' }}>Coordinate System:</div>
                  <div>• X-axis: Urgency (0-10) → Left to Right</div>
                  <div>• Y-axis: Importance (10-0) → Top to Bottom</div>
                  <div>• Origin (0,10): Top-Left of grid</div>
                  <div>• Max (10,0): Bottom-Right of grid</div>
                </div>

                {/* Show task positions with arrows - RESPONSIVE */}
                {incompleteTasks.slice(0, 5).map((task) => {
                  const xPercent = (task.urgency / 10) * 100
                  const yPercent = (1 - task.importance / 10) * 100

                  return (
                    <div key={`debug-task-${task.id}`}>
                      {/* Arrow pointing to task position */}
                      <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
                        <line
                          x1={`${xPercent}%`}
                          y1={`${yPercent}%`}
                          x2={`${xPercent + 10}%`}
                          y2={`${yPercent - 5}%`}
                          stroke="red"
                          strokeWidth="2"
                          markerEnd="url(#arrowhead)"
                        />
                        <defs>
                          <marker id="arrowhead" markerWidth="10" markerHeight="7"
                           refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="red" />
                          </marker>
                        </defs>
                      </svg>
                      {/* Label with task info */}
                      <div style={{
                        position: 'absolute',
                        left: `${Math.min(xPercent + 11, 85)}%`, // Keep within bounds
                        top: `${Math.max(yPercent - 8, 2)}%`, // Keep within bounds
                        background: 'white',
                        border: '1px solid red',
                        padding: '2px 5px',
                        borderRadius: '3px',
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        maxWidth: '15%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        <div style={{ fontWeight: 'bold' }}>{task.name.slice(0, 15)}</div>
                        <div>I:{task.importance} U:{task.urgency}</div>
                        <div>Pos: ({xPercent.toFixed(0)}%, {yPercent.toFixed(0)}%)</div>
                      </div>
                    </div>
                  )
                })}

                {/* Show exact center point - RESPONSIVE */}
                <div style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 10,
                  height: 10,
                  background: 'lime',
                  border: '2px solid green',
                  borderRadius: '50%',
                  transform: 'translate(-50%, -50%)',
                }} />
                <div style={{
                  position: 'absolute',
                  left: '52%',
                  top: '50%',
                  background: 'white',
                  padding: '2px 5px',
                  border: '1px solid green',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  transform: 'translateY(-50%)',
                }}>
                  Center (I:5, U:5)
                </div>
              </div>
            )}

            {/* Debug Mode Toggle Button */}
            <Button
              size="small"
              type="text"
              onClick={() => setDebugMode(!debugMode)}
              style={{
                position: 'absolute',
                bottom: 10,
                right: 10,
                zIndex: 1001,
                background: debugMode ? 'magenta' : 'white',
                color: debugMode ? 'white' : 'black',
              }}
            >
              {debugMode ? '🔍 Debug ON' : '🔍 Debug OFF'}
            </Button>

            {/* Old task rendering removed - tasks now render inside grid box */}
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
                Eisenhower Priority Order ({scannedTasks.length} items)
              </Text>
            </Space>
          }
          style={{ background: '#FAFBFC' }}
        >
          <div>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {scannedTasks.map((task, index) => {
                const isStep = (task as any).isStep
                const stepIndex = (task as any).stepIndex
                const stepName = (task as any).stepName

                return (
                <div
                  key={task.id}
                  onClick={() => selectTask(isStep ? (task as any).parentWorkflow : task.id)}
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
                  <Text style={{
                    flex: 1,
                    fontStyle: isStep ? 'italic' : 'normal',
                    paddingLeft: isStep ? 16 : 0,
                  }}>
                    {isStep ? `↳ Step ${stepIndex + 1}: ${stepName}` : task.name}
                  </Text>
                  <Space size="small">
                    {isStep && (
                      <Tag size="small" color="blue">
                        Step
                      </Tag>
                    )}
                    <Tag size="small" color={quadrantConfig[categorizeTask(task)].color}>
                      {quadrantConfig[categorizeTask(task)].title}
                    </Tag>
                  </Space>
                </div>
                )
              })}
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
