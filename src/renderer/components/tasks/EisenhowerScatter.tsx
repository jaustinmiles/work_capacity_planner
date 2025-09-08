import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Card, Typography, Space, Tag, Button, Badge, Tooltip } from '@arco-design/web-react'
import { IconScan } from '@arco-design/web-react/icon'
// import { TaskType } from '@shared/enums' // Not used in this component
import { Task } from '@shared/types'
import { getRendererLogger } from '../../../logging/index.renderer'
import { useContainerQuery } from '../../hooks/useContainerQuery'
import { useResponsive } from '../../providers/ResponsiveProvider'

const { Text } = Typography

interface EisenhowerScatterProps {
  tasks: Task[]
  allItemsForScatter: Array<Task & { isStep?: boolean; parentWorkflow?: string; stepName?: string; stepIndex?: number }>
  onSelectTask: (task: Task) => void
  containerSize: { width: number; height: number }
  setContainerSize: (size: { width: number; height: number }) => void
}

const logger = getRendererLogger().child({ category: 'eisenhower' })

export function EisenhowerScatter({
  tasks,
  allItemsForScatter,
  onSelectTask,
  containerSize,
  setContainerSize,
}: EisenhowerScatterProps) {
  const { ref: scatterContainerRef, width: containerWidth, height: containerHeight } = useContainerQuery<HTMLDivElement>()
  const { isCompact, isMobile } = useResponsive()
  const [debugMode, setDebugMode] = useState(false)
  const renderCountRef = useRef(0)
  const frameCountRef = useRef(0)

  // Diagonal scan state
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null)
  const [scannedTasks, setScannedTasks] = useState<Task[]>([])
  const scanAnimationRef = useRef<number | undefined>(undefined)

  // Log component lifecycle
  useEffect(() => {
    logger.error('[SCAN-DEBUG] 🚀 COMPONENT MOUNTED', {
      timestamp: new Date().toISOString(),
      tasksCount: tasks.length,
      allItemsCount: allItemsForScatter.length,
      containerSize,
    })
    return () => {
      logger.error('[SCAN-DEBUG] 💀 COMPONENT UNMOUNTING', {
        timestamp: new Date().toISOString(),
      })
    }
  }, [])

  // Log state changes
  useEffect(() => {
    logger.warn('[SCAN-DEBUG] 📊 SCANNING STATE CHANGED', {
      isScanning,
      timestamp: new Date().toISOString(),
    })
  }, [isScanning])

  useEffect(() => {
    logger.warn('[SCAN-DEBUG] 📝 SCANNED TASKS CHANGED', {
      count: scannedTasks.length,
      tasks: scannedTasks.map(t => ({ id: t.id, name: t.name })),
      timestamp: new Date().toISOString(),
    })
  }, [scannedTasks])

  // Log every render
  renderCountRef.current++
  logger.info('[SCAN-DEBUG] 🔄 RENDER', {
    renderCount: renderCountRef.current,
    timestamp: new Date().toISOString(),
    tasksCount: tasks.length,
    allItemsCount: allItemsForScatter.length,
    scannedTasksCount: scannedTasks.length,
    isScanning,
    scanProgress: scanProgress.toFixed(4),
    containerSize,
  })

  // Calculate responsive padding
  const PADDING_MOBILE = 20
  const PADDING_COMPACT = 40
  const PADDING_DESKTOP = 50
  const padding = isMobile ? PADDING_MOBILE : isCompact ? PADDING_COMPACT : PADDING_DESKTOP

  // Filter incomplete tasks
  const incompleteTasks = tasks.filter(task => !task.completed)

  // Update container size based on container query results
  useEffect(() => {
    logger.warn('🔄 [SCATTER] Container resize detected', {
      measured: { width: containerWidth, height: containerHeight },
      current: containerSize,
      hasValidDimensions: !!(containerWidth && containerHeight),
      padding,
      viewMode: 'scatter',
      timestamp: Date.now(),
    })

    if (containerWidth && containerHeight) {
      const newSize = {
        width: containerWidth,
        height: containerHeight,
      }

      // Only update if significantly different to avoid render loops
      const widthDiff = Math.abs(newSize.width - containerSize.width)
      const heightDiff = Math.abs(newSize.height - containerSize.height)

      if (widthDiff > 10 || heightDiff > 10) {
        logger.info('📐 [SCATTER] Size calculation', {
          input: { containerWidth, containerHeight },
          padding,
          calculated: newSize,
          current: containerSize,
          difference: { width: widthDiff, height: heightDiff },
          needsUpdate: true,
          gridSize: { width: newSize.width - 2 * padding, height: newSize.height - 2 * padding },
        })

        setContainerSize(newSize)
      } else {
        logger.debug('⏸️ [SCATTER] Size update skipped (difference < 10px)')
      }
    }
  }, [containerWidth, containerHeight, containerSize, padding, setContainerSize])

  // Scatter plot logging - only log when tasks change, not on every resize
  useEffect(() => {
    if (incompleteTasks.length > 0) {
      logger.debug('EISENHOWER SCATTER DEBUG: Tasks updated', {
        category: 'eisenhower',
        taskCount: incompleteTasks.length,
        containerWidth: containerSize.width,
        containerHeight: containerSize.height,
        firstTaskImportance: incompleteTasks[0]?.importance,
        firstTaskUrgency: incompleteTasks[0]?.urgency,
      })

      logger.info('Scatter view tasks updated', {
        category: 'eisenhower',
        taskCount: incompleteTasks.length,
        importanceDistribution: {
          min: Math.min(...incompleteTasks.map(t => t.importance)),
          max: Math.max(...incompleteTasks.map(t => t.importance)),
          unique: [...new Set(incompleteTasks.map(t => t.importance))],
        },
        urgencyDistribution: {
          min: Math.min(...incompleteTasks.map(t => t.urgency)),
          max: Math.max(...incompleteTasks.map(t => t.urgency)),
          unique: [...new Set(incompleteTasks.map(t => t.urgency))],
        },
        timestamp: new Date().toISOString(),
      })
    }
  }, [incompleteTasks]) // Removed containerSize to prevent spam on resize

  // Calculate distance from a point to the diagonal scan line
  const getDistanceToScanLine = useCallback((xPercent: number, yPercent: number) => {
    // Use full container dimensions for consistency with SVG rendering
    // The scan line SVG uses the full container, so we should too
    const containerRect = { width: containerSize.width, height: containerSize.height }

    // Clamp scan progress to 0-1 range for line calculations
    // (animation continues to 2.0 but scan line stops at 1.0)
    const clampedProgress = Math.min(Math.max(scanProgress, 0), 1)

    // Scan line moves from top-right to bottom-left
    // Progress 0: line from (100%, 0%) to (100%, 0%) - just a point at top-right
    // Progress 1: line from (0%, 0%) to (100%, 100%) - full diagonal
    const scanLineX1 = containerRect.width * (1 - clampedProgress) // Moving start point
    const scanLineY1 = 0 // Top edge
    const scanLineX2 = containerRect.width // Right edge (fixed)
    const scanLineY2 = containerRect.height * clampedProgress // Moving down

    // Convert task position to pixels - use same coordinate system as visual rendering
    // Tasks are displayed at percentage positions, so we use the same here
    // NO PADDING - tasks and scan line both use full container coordinates
    const pointX = (xPercent / 100) * containerRect.width
    const pointY = (yPercent / 100) * containerRect.height

    // Handle edge case where scan line is a point (at start of animation)
    if (clampedProgress === 0) {
      // Distance to the starting point (top-right corner)
      const dx = pointX - containerRect.width
      const dy = pointY - 0
      return Math.sqrt(dx * dx + dy * dy)
    }

    // Calculate perpendicular distance from point to line
    const A = scanLineY2 - scanLineY1
    const B = scanLineX1 - scanLineX2
    const C = scanLineX2 * scanLineY1 - scanLineX1 * scanLineY2

    // Avoid division by zero
    const denominator = Math.sqrt(A * A + B * B)
    if (denominator === 0) {
      // Line is degenerate (point), calculate distance to that point
      const dx = pointX - scanLineX1
      const dy = pointY - scanLineY1
      return Math.sqrt(dx * dx + dy * dy)
    }

    const distance = Math.abs(A * pointX + B * pointY + C) / denominator
    
    // Log distance calculation details for debugging
    if (scanProgress > 0.24 && scanProgress < 0.26) {
      logger.error('[SCAN-DEBUG] 📐 DISTANCE CALC', {
        rawProgress: scanProgress.toFixed(4),
        clampedProgress: clampedProgress.toFixed(4),
        scanLine: { x1: scanLineX1.toFixed(2), y1: scanLineY1.toFixed(2), x2: scanLineX2.toFixed(2), y2: scanLineY2.toFixed(2) },
        taskPosition: { xPercent, yPercent, xPixels: pointX.toFixed(2), yPixels: pointY.toFixed(2) },
        lineEquation: { A: A.toFixed(2), B: B.toFixed(2), C: C.toFixed(2) },
        denominator: denominator.toFixed(2),
        distance: distance.toFixed(2),
      })
    }
    
    return distance
  }, [containerSize, scanProgress])

  // Start/stop diagonal scan animation
  const toggleDiagonalScan = useCallback(() => {
    if (isScanning) {
      logger.error('[SCAN-DEBUG] 🛑 STOPPING SCAN', {
        timestamp: new Date().toISOString(),
        scannedTasksBeforeStop: scannedTasks.length,
        scannedTasksList: scannedTasks.map(t => ({ id: t.id, name: t.name })),
      })
      // Stop scanning but KEEP the results visible
      setIsScanning(false)
      setScanProgress(0)
      setHighlightedTaskId(null)
      // Don't clear scannedTasks here - keep them visible!

      if (scanAnimationRef.current !== undefined) {
        window.cancelAnimationFrame(scanAnimationRef.current)
        scanAnimationRef.current = undefined
      }
      return
    }

    // Start scanning
    const tasksOnly = allItemsForScatter.filter(item => !item.isStep)
    const stepsOnly = allItemsForScatter.filter(item => item.isStep)

    // Calculate and log the threshold that will be used
    const scanThreshold = Math.min(containerSize.width, containerSize.height) * 0.25

    logger.info('🔍 STARTING DIAGONAL SCAN', {
      category: 'eisenhower-scan',
      totalItems: allItemsForScatter.length,
      tasks: tasksOnly.length,
      workflowSteps: stepsOnly.length,
      containerSize,
      thresholdPixels: Math.round(scanThreshold),
      thresholdPercentage: '25% of min dimension',
      padding,
      timestamp: new Date().toISOString(),
    })

    logger.error('[SCAN-DEBUG] 🟢 STARTING NEW SCAN', {
      timestamp: new Date().toISOString(),
      clearingPreviousTasks: scannedTasks.length,
      previousTasks: scannedTasks.map(t => ({ id: t.id, name: t.name })),
      allItemsToScan: allItemsForScatter.length,
      itemNames: allItemsForScatter.map(t => t.name),
    })
    frameCountRef.current = 0 // Reset frame counter
    setIsScanning(true)
    setScanProgress(0)
    setScannedTasks([])

    const scannedTaskIds = new Set<string>()
    const scanStartTime = Date.now()

    const animate = () => {
      frameCountRef.current++
      const frameNum = frameCountRef.current
      const elapsed = Date.now() - scanStartTime
      const duration = 4000 // 4 seconds total
      const progress = Math.min(elapsed / duration, 2.0) // Allow progress to go beyond 1.0 to 2.0

      // Log EVERY frame
      logger.info('[SCAN-DEBUG] 🎬 ANIMATION FRAME', {
        frameNumber: frameNum,
        elapsed,
        progress: progress.toFixed(4),
        timestamp: new Date().toISOString(),
        containerSize,
        scanLine: {
          x1: (containerSize.width * (1 - progress)).toFixed(2),
          y1: 0,
          x2: containerSize.width,
          y2: (containerSize.height * progress).toFixed(2),
        },
        totalTasksToScan: allItemsForScatter.length,
      })

      setScanProgress(progress)

      // Find tasks within threshold of scan line
      const currentHighlighted: string[] = []

      // Calculate a dynamic threshold - increase to 25% for better detection
      // This gives us a wider band around the diagonal line
      const dynamicThreshold = Math.min(containerSize.width, containerSize.height) * 0.25
      
      // Log threshold calculation on first frame
      if (frameNum === 1) {
        logger.error('[SCAN-DEBUG] 🎯 THRESHOLD CALCULATION', {
          containerWidth: containerSize.width,
          containerHeight: containerSize.height,
          minDimension: Math.min(containerSize.width, containerSize.height),
          calculatedThreshold: dynamicThreshold,
          percentage: '25%',
        })
      }

      // Track closest task for debugging
      type ScatterItem = Task & { isStep?: boolean; parentWorkflow?: string; stepName?: string; stepIndex?: number }
      let closestTask: { task: ScatterItem; distance: number } | null = null

      allItemsForScatter.forEach((task: ScatterItem, taskIndex) => {
        const xPercent = task.urgency * 10 // Convert 0-10 to 0-100%
        const yPercent = 100 - (task.importance * 10) // Convert 0-10 to 0-100%, inverted

        const distance = getDistanceToScanLine(xPercent, yPercent)

        // Log EVERY task position on key frames
        if (frameNum <= 5 || frameNum % 50 === 0 || distance <= dynamicThreshold || (frameNum >= 240 && frameNum <= 245)) {
          logger.error('[SCAN-DEBUG] 📍 TASK POSITION', {
            frameNumber: frameNum,
            taskIndex,
            taskId: task.id,
            taskName: task.name,
            importance: task.importance,
            urgency: task.urgency,
            xPercent: xPercent.toFixed(2),
            yPercent: yPercent.toFixed(2),
            xPixels: ((xPercent / 100) * containerSize.width).toFixed(2),
            yPixels: ((yPercent / 100) * containerSize.height).toFixed(2),
            distance: distance.toFixed(2),
            threshold: dynamicThreshold.toFixed(2),
            willBeScanned: distance <= dynamicThreshold,
            progress: progress.toFixed(4),
          })
        }

        // Track closest task
        if (!closestTask || distance < closestTask.distance) {
          closestTask = { task, distance }
        }

        // Log first scan attempt with detailed info
        if (scannedTaskIds.size === 0 && progress > 0.3 && progress < 0.35) {
          logger.debug('📏 Scan line position and task distance', {
            category: 'eisenhower-scan',
            scanProgress: progress.toFixed(2),
            scanLine: {
              x1: Math.round((1 - progress) * containerSize.width),
              y1: 0,
              x2: containerSize.width,
              y2: Math.round(progress * containerSize.height),
            },
            task: {
              name: task.name,
              importance: task.importance,
              urgency: task.urgency,
              isStep: task.isStep || false,
            },
            position: {
              xPercent: xPercent.toFixed(1),
              yPercent: yPercent.toFixed(1),
              xPixels: Math.round((xPercent / 100) * containerSize.width),
              yPixels: Math.round((yPercent / 100) * containerSize.height),
            },
            distance: Math.round(distance),
            threshold: Math.round(dynamicThreshold),
            willBeScanned: distance <= dynamicThreshold,
          })
        }

        if (distance <= dynamicThreshold) {
          currentHighlighted.push(task.id)

          if (!scannedTaskIds.has(task.id)) {
            logger.error('[SCAN-DEBUG] 🎯 ADDING TASK TO SCANNED', {
              frameNumber: frameNum,
              taskId: task.id,
              taskName: task.name,
              importance: task.importance,
              urgency: task.urgency,
              distance: distance.toFixed(2),
              threshold: dynamicThreshold.toFixed(2),
              scannedSoFar: scannedTaskIds.size,
              timestamp: new Date().toISOString(),
            })
            scannedTaskIds.add(task.id)
            
            // Update React state immediately when task is detected
            setScannedTasks(prev => {
              // Check if task already exists in the state
              if (prev.some(t => t.id === task.id)) {
                return prev
              }
              
              // Convert to Task type if needed
              const taskToAdd: Task = {
                id: task.id,
                name: task.name,
                importance: task.importance,
                urgency: task.urgency,
                duration: task.duration,
                completed: task.completed,
                createdAt: task.createdAt,
                updatedAt: task.updatedAt,
                deadline: task.deadline,
                deadlineType: task.deadlineType,
                type: task.type,
                asyncWaitTime: task.asyncWaitTime,
                dependencies: task.dependencies,
                completedAt: task.completedAt,
                cognitiveComplexity: task.cognitiveComplexity,
                isLocked: task.isLocked,
                lockedStartTime: task.lockedStartTime,
                sessionId: task.sessionId,
                actualDuration: task.actualDuration,
                notes: task.notes,
                projectId: task.projectId,
                hasSteps: task.hasSteps,
                currentStepId: task.currentStepId,
                overallStatus: task.overallStatus,
                criticalPathDuration: task.criticalPathDuration,
                worstCaseDuration: task.worstCaseDuration,
                steps: task.steps,
                isAsyncTrigger: task.isAsyncTrigger,
              }
              
              const newTasks = [...prev, taskToAdd]
              logger.error('[SCAN-DEBUG] 📋 UPDATING SCANNED TASKS STATE', {
                frameNumber: frameNum,
                oldCount: prev.length,
                newCount: newTasks.length,
                addedTask: task.name,
                timestamp: new Date().toISOString(),
              })
              return newTasks
            })
            
            onSelectTask(task)

            // Log the scanned task name for user feedback with more emphasis
            logger.info('🎯 TASK FOUND DURING DIAGONAL SCAN', {
              category: 'eisenhower-scan',
              scanProgress: progress.toFixed(2),
              taskName: task.name,
              taskType: task.isStep ? 'workflow-step' : 'task',
              importance: task.importance,
              urgency: task.urgency,
              position: { x: xPercent.toFixed(1), y: yPercent.toFixed(1) },
              distance: Math.round(distance),
              threshold: Math.round(dynamicThreshold),
              foundCount: scannedTaskIds.size,
            })
          }
        }
      })

      // Log closest task at midpoint if nothing found yet
      if (scannedTaskIds.size === 0 && progress > 0.5 && progress < 0.55) {
        if (closestTask) {
          const { task, distance } = closestTask as { task: ScatterItem; distance: number }
          logger.warn('📍 No tasks found yet - closest task', {
            category: 'eisenhower-scan',
            closestTaskName: task.name,
            closestDistance: Math.round(distance),
            threshold: Math.round(dynamicThreshold),
            needsLargerThreshold: distance > dynamicThreshold,
            suggestedThreshold: Math.round(distance * 1.2),
          })
        }
      }

      setHighlightedTaskId(currentHighlighted.length > 0 ? currentHighlighted[0] : null)

      // Debug logging for animation progress
      if (progress % 0.1 < 0.02) { // Log every ~10% progress
        logger.debug('Diagonal scan progress', {
          progress: Math.round(progress * 100) / 100,
          elapsed: elapsed,
          highlighted: currentHighlighted.length,
          scanned: scannedTaskIds.size,
        })
      }

      if (progress >= 2.0) {
        // Animation complete - log final results
        const scannedTasksInfo = Array.from(scannedTaskIds).map(taskId => {
          const task = allItemsForScatter.find(t => t.id === taskId)
          return task ? {
            name: task.name,
            importance: task.importance,
            urgency: task.urgency,
          } : null
        }).filter(Boolean)

        logger.error('[SCAN-DEBUG] 🏁 SCAN COMPLETE', {
          totalFrames: frameNum,
          scannedCount: scannedTaskIds.size,
          scannedTasks: scannedTasksInfo,
          animationDuration: elapsed,
          finalScannedTasksState: scannedTasks,
          timestamp: new Date().toISOString(),
          finalProgress: progress,
        })

        if (scannedTaskIds.size === 0) {
          const threshold = Math.min(containerSize.width, containerSize.height) * 0.15
          logger.warn('⚠️ No tasks found during diagonal scan', {
            category: 'eisenhower-scan',
            message: `No tasks are positioned near the diagonal line (threshold: ${Math.round(threshold)}px)`,
            containerSize,
            totalTasksScanned: allItemsForScatter.length,
          })
        }
        setIsScanning(false)
        setScanProgress(0)
        setHighlightedTaskId(null)
        scanAnimationRef.current = undefined
      } else {
        scanAnimationRef.current = window.requestAnimationFrame(animate)
      }
    }

    scanAnimationRef.current = window.requestAnimationFrame(animate)
  }, [isScanning, allItemsForScatter, onSelectTask, getDistanceToScanLine, containerSize, scannedTasks])

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (scanAnimationRef.current !== undefined) {
        window.cancelAnimationFrame(scanAnimationRef.current)
      }
    }
  }, [])

  // Task clustering for overlapping positions - use more precision to reduce clustering
  const taskClusters = useMemo(() => {
    const clusters = new Map<string, typeof allItemsForScatter>()

    allItemsForScatter.forEach(task => {
      const xPercent = task.urgency * 10
      const yPercent = 100 - (task.importance * 10)
      // Round to 0.5 increments for less aggressive clustering
      // This allows values like 5.1 and 5.4 to be at different positions
      const roundedX = Math.round(xPercent * 2) / 2
      const roundedY = Math.round(yPercent * 2) / 2
      const posKey = `${roundedX}-${roundedY}`

      if (!clusters.has(posKey)) {
        clusters.set(posKey, [])
      }
      clusters.get(posKey)!.push(task)
    })

    return clusters
  }, [allItemsForScatter])

  return (
    <div>
      {/* Scatter Plot Controls */}
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Button
            type={isScanning ? 'primary' : 'default'}
            icon={<IconScan />}
            onClick={toggleDiagonalScan}
            loading={isScanning}
            size="small"
          >
            {isScanning ? 'Scan...' : 'Scan'}
          </Button>
        </Space>
      </Card>

      {/* Scatter Plot View */}
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

          {/* Main scatter plot content area */}
          <div style={{
            position: 'absolute',
            top: padding,
            left: padding,
            right: padding,
            bottom: padding,
            border: '2px solid #e5e6eb',
            background: 'white',
          }}>
            {/* Axes and grid lines */}
            <svg
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
              }}
            >
              {/* Quadrant divider lines (at 50% = value 5 on 0-10 scale) */}
              <line
                x1="50%"
                y1="0%"
                x2="50%"
                y2="100%"
                stroke="#d4d4d8"
                strokeWidth="2"
                strokeDasharray="8,4"
              />
              <line
                x1="0%"
                y1="50%"
                x2="100%"
                y2="50%"
                stroke="#d4d4d8"
                strokeWidth="2"
                strokeDasharray="8,4"
              />

              {/* Center cross at (5,5) - intersection point */}
              <circle
                cx="50%"
                cy="50%"
                r="4"
                fill="#165DFF"
                stroke="white"
                strokeWidth="2"
              />

              {/* Axis scale markers */}
              {[0, 2.5, 5, 7.5, 10].map((value) => (
                <g key={`x-${value}`}>
                  {/* X-axis labels */}
                  <text
                    x={`${value * 10}%`}
                    y="100%"
                    dy="-5"
                    textAnchor="middle"
                    fontSize="10"
                    fill="#6b7280"
                  >
                    {value}
                  </text>
                </g>
              ))}
              {[10, 7.5, 5, 2.5, 0].map((value, index) => (
                <g key={`y-${value}`}>
                  {/* Y-axis labels (inverted because higher importance = higher on screen) */}
                  <text
                    x="0%"
                    y={`${index * 25}%`}
                    dx="5"
                    dy="4"
                    fontSize="10"
                    fill="#6b7280"
                  >
                    {value}
                  </text>
                </g>
              ))}
            </svg>
            {/* Task clusters and plotting logic would go here */}
            {/* This would need the full complex rendering logic from the original component */}
            {Array.from(taskClusters.entries()).map(([posKey, clusterTasks]) => {
              const [x, y] = posKey.split('-').map(Number)
              const task = clusterTasks[0]
              const isHighlighted = highlightedTaskId === task.id

              return (
                <div
                  key={posKey}
                  style={{
                    position: 'absolute',
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: 'translate(-50%, -50%)',
                    cursor: 'pointer',
                  }}
                  onClick={() => onSelectTask(task)}
                >
                  {clusterTasks.length > 1 ? (
                    <Tooltip
                      content={
                        <div>
                          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
                            {clusterTasks.length} items at this position:
                          </div>
                          {clusterTasks.map((t, i) => (
                            <div key={t.id} style={{ fontSize: 12 }}>
                              {i + 1}. {t.name} {t.isStep ? '(step)' : ''}
                            </div>
                          ))}
                        </div>
                      }
                    >
                      <Badge count={clusterTasks.length}>
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          backgroundColor: isHighlighted ? '#ff4757' :
                            clusterTasks.some(t => t.isStep) ? '#9b59b6' : '#3742fa',
                          border: clusterTasks.some(t => t.isStep) ? '2px dashed rgba(255,255,255,0.5)' : 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: 12,
                          fontWeight: 'bold',
                        }}>
                          {task.name.substring(0, 2)}
                        </div>
                      </Badge>
                    </Tooltip>
                  ) : (
                    <Tooltip content={`${task.name}${task.isStep ? ' (workflow step)' : ''}`}>
                      <div style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        backgroundColor: isHighlighted ? '#ff4757' :
                          task.isStep ? '#9b59b6' : '#3742fa',
                        border: task.isStep ? '2px dashed rgba(255,255,255,0.5)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: 10,
                        fontWeight: 'bold',
                      }}>
                        {task.name.substring(0, 2)}
                      </div>
                    </Tooltip>
                  )}
                </div>
              )
            })}

            {/* Diagonal Scan Line Animation */}
            {isScanning && (
              <div
                data-testid="diagonal-scan-line"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  pointerEvents: 'none',
                  zIndex: 1000,
                }}
              >
                <svg
                  style={{
                    width: '100%',
                    height: '100%',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                  }}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="scan-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" style={{ stopColor: '#ff6b6b', stopOpacity: 1 }} />
                      <stop offset="50%" style={{ stopColor: '#4ecdc4', stopOpacity: 1 }} />
                      <stop offset="100%" style={{ stopColor: '#45b7d1', stopOpacity: 0.8 }} />
                    </linearGradient>
                  </defs>
                  <line
                    x1={`${100 * (1 - scanProgress)}%`}
                    y1="0%"
                    x2="100%"
                    y2={`${100 * scanProgress}%`}
                    stroke="url(#scan-gradient)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    style={{
                      filter: 'drop-shadow(0 0 4px rgba(255, 107, 107, 0.6))',
                    }}
                  />
                </svg>
              </div>
            )}

            {/* Debug Mode Elements */}
            {debugMode && (
              <div style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 8,
                height: 8,
                background: 'lime',
                border: '2px solid green',
                borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
              }} />
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
          </div>
        </div>
      </Card>

      {/* Scanned Tasks List */}
      {(() => {
        logger.error('[SCAN-DEBUG] 🎨 CHECKING SCANNED TASKS CARD RENDER', {
          shouldRender: scannedTasks.length > 0,
          taskCount: scannedTasks.length,
          tasks: scannedTasks.map(t => ({ id: t.id, name: t.name })),
          timestamp: new Date().toISOString(),
        })
        return null
      })()}
      {scannedTasks.length > 0 && (
        <Card
          title={
            <Space>
              <IconScan style={{ fontSize: 18 }} />
              <Text style={{ fontWeight: 500 }}>
                Scanned Tasks ({scannedTasks.length})
              </Text>
            </Space>
          }
          style={{ marginTop: 16 }}
          ref={(el: HTMLDivElement | null) => {
            if (el) {
              logger.error('[SCAN-DEBUG] 📦 SCANNED TASKS CARD MOUNTED IN DOM', {
                elementExists: true,
                taskCount: scannedTasks.length,
                boundingRect: {
                  top: el.getBoundingClientRect().top,
                  left: el.getBoundingClientRect().left,
                  width: el.getBoundingClientRect().width,
                  height: el.getBoundingClientRect().height,
                },
                timestamp: new Date().toISOString(),
              })
            }
          }}
        >
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {scannedTasks.map((task, index) => {  
                logger.info('[SCAN-DEBUG] 📝 RENDERING TASK ITEM', {
                  index,
                  taskId: task.id,
                  taskName: task.name,
                  timestamp: new Date().toISOString(),
                })
                return (
                <div key={task.id} style={{
                  padding: '8px 12px',
                  background: '#f5f5f5',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
                onClick={() => onSelectTask(task)}>
                  <Space>
                    <Tag size="small" color="blue">#{index + 1}</Tag>
                    <Text style={{ fontWeight: 500 }}>{task.name}</Text>
                    <Tag size="small" color="purple">I:{task.importance}</Tag>
                    <Tag size="small" color="orange">U:{task.urgency}</Tag>
                    <Tag size="small">
                      {task.importance >= 7 && task.urgency >= 7 ? 'Do First' :
                       task.importance >= 7 ? 'Schedule' :
                       task.urgency >= 7 ? 'Delegate' : 'Eliminate'}
                    </Tag>
                  </Space>
                </div>
              )
              })}
            </Space>
          </div>
        </Card>
      )}
    </div>
  )
}
