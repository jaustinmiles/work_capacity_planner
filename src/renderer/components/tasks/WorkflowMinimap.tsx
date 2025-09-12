import React, { useMemo } from 'react'
import { TaskType } from '@shared/enums'
import { SequencedTask } from '@shared/sequencing-types'
import { useTaskStore } from '@renderer/store/useTaskStore'

interface WorkflowMinimapProps {
  task: SequencedTask
  width?: number
  height?: number
}

export function WorkflowMinimap({ task, width = 280, height = 80 }: WorkflowMinimapProps) {
  const isStepActivelyWorkedOn = useTaskStore(state => state.isStepActivelyWorkedOn)

  // Calculate positions for incomplete steps
  const { incompleteSteps, layout } = useMemo(() => {
    // Filter to only show incomplete steps
    const incomplete = task.steps.filter(step =>
      step.status === 'pending' || step.status === 'in_progress' || step.status === 'waiting',
    )

    if (incomplete.length === 0) {
      return { incompleteSteps: [], layout: { levels: 0, maxPerLevel: 0 } }
    }

    // Build dependency map
    const dependencyMap = new Map<string, string[]>()
    incomplete.forEach(step => {
      dependencyMap.set(step.id, step.dependsOn || [])
    })

    // Calculate levels for each step
    const levels = new Map<string, number>()
    const calculateLevel = (stepId: string, visited = new Set<string>()): number => {
      if (visited.has(stepId)) return 0
      visited.add(stepId)

      const deps = dependencyMap.get(stepId) || []
      if (deps.length === 0) return 0

      const maxDepLevel = deps.reduce((max, depId) => {
        const depStep = incomplete.find(s => s.id === depId)
        if (!depStep) return max
        return Math.max(max, calculateLevel(depId, visited))
      }, -1)

      return maxDepLevel + 1
    }

    incomplete.forEach(step => {
      levels.set(step.id, calculateLevel(step.id))
    })

    // Group by level
    const levelGroups = new Map<number, typeof incomplete>()
    incomplete.forEach(step => {
      const level = levels.get(step.id) || 0
      if (!levelGroups.has(level)) {
        levelGroups.set(level, [])
      }
      levelGroups.get(level)!.push(step)
    })

    const maxLevel = Math.max(...Array.from(levelGroups.keys()))
    const maxPerLevel = Math.max(...Array.from(levelGroups.values()).map(g => g.length))

    return {
      incompleteSteps: incomplete.map(step => ({
        ...step,
        level: levels.get(step.id) || 0,
        levelIndex: levelGroups.get(levels.get(step.id) || 0)?.indexOf(step) || 0,
      })),
      layout: {
        levels: maxLevel + 1,
        maxPerLevel,
      },
    }
  }, [task.steps])

  if (incompleteSteps.length === 0) {
    return (
      <div style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#86909c',
        fontSize: 12,
      }}>
        All steps completed
      </div>
    )
  }

  const nodeSize = 20
  const padding = 10
  const availableWidth = width - (padding * 2)
  const availableHeight = height - (padding * 2)

  // Calculate spacing
  const horizontalSpacing = layout.levels > 1 ? availableWidth / (layout.levels - 1) : availableWidth / 2
  const verticalSpacing = layout.maxPerLevel > 1 ? availableHeight / (layout.maxPerLevel - 1) : availableHeight / 2

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      {/* Draw connections first */}
      {incompleteSteps.map(step => {
        const stepX = padding + (step.level * horizontalSpacing)
        const stepY = padding + (step.levelIndex * verticalSpacing)

        return (step.dependsOn || []).map(depId => {
          const depStep = incompleteSteps.find(s => s.id === depId)
          if (!depStep) return null

          const depX = padding + (depStep.level * horizontalSpacing)
          const depY = padding + (depStep.levelIndex * verticalSpacing)

          return (
            <line
              key={`${depId}-${step.id}`}
              x1={depX + nodeSize / 2}
              y1={depY + nodeSize / 2}
              x2={stepX - nodeSize / 2}
              y2={stepY + nodeSize / 2}
              stroke="#d9d9d9"
              strokeWidth="1"
            />
          )
        })
      })}

      {/* Draw nodes */}
      {incompleteSteps.map((step, index) => {
        const x = padding + (step.level * horizontalSpacing)
        const y = padding + (step.levelIndex * verticalSpacing)
        const isInProgress = step.status === 'in_progress' && isStepActivelyWorkedOn(step.id)
        const isFocused = step.type === TaskType.Focused

        return (
          <g key={step.id}>
            <circle
              cx={x}
              cy={y}
              r={nodeSize / 2}
              fill={isInProgress ? '#FF7D00' : (isFocused ? '#165DFF' : '#00B42A')}
              stroke={isInProgress ? '#FF7D00' : (isFocused ? '#165DFF' : '#00B42A')}
              strokeWidth={isInProgress ? '2' : '1'}
              opacity={isInProgress ? 1 : 0.7}
            />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize="10"
              fontWeight="bold"
            >
              {index + 1}
            </text>
            {isInProgress && (
              <circle
                cx={x}
                cy={y}
                r={nodeSize / 2 + 3}
                fill="none"
                stroke="#FF7D00"
                strokeWidth="1"
                strokeDasharray="2,2"
                opacity="0.5"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  values="0;4"
                  dur="1s"
                  repeatCount="indefinite"
                />
              </circle>
            )}
          </g>
        )
      })}
    </svg>
  )
}
