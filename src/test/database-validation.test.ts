import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

describe('Database Validation Tests', () => {
  let testSessionId: string

  beforeAll(async () => {
    // Create a test session
    const session = await prisma.session.create({
      data: {
        id: 'test-session-' + Date.now(),
        name: 'Test Session',
        description: 'Session for validation tests',
        isActive: false,
      },
    })
    testSessionId = session.id
  })

  afterAll(async () => {
    // Clean up test data
    await prisma.task.deleteMany({ where: { sessionId: testSessionId } })
    await prisma.workPattern.deleteMany({ where: { sessionId: testSessionId } })
    await prisma.session.delete({ where: { id: testSessionId } })
    await prisma.$disconnect()
  })

  describe('Task Operations', () => {
    it('should create a task with all required fields', async () => {
      const task = await prisma.task.create({
        data: {
          id: 'test-task-' + Date.now(),
          name: 'Test Task',
          duration: 60,
          importance: 5,
          urgency: 5,
          type: 'focused',
          sessionId: testSessionId,
          hasSteps: false,
          overallStatus: 'not_started',
          criticalPathDuration: 60,
          worstCaseDuration: 60,
          dependencies: '[]',
          asyncWaitTime: 0,
          completed: false,
          updatedAt: new Date(),
        },
      })

      expect(task).toBeDefined()
      expect(task.name).toBe('Test Task')
      expect(task.hasSteps).toBe(false)
      expect(task.overallStatus).toBe('not_started')
    })

    it('should handle boolean fields correctly', async () => {
      const task = await prisma.task.create({
        data: {
          id: 'test-task-bool-' + Date.now(),
          name: 'Boolean Test Task',
          duration: 30,
          importance: 3,
          urgency: 3,
          type: 'admin',
          sessionId: testSessionId,
          hasSteps: true,
          completed: true,
          overallStatus: 'completed',
          criticalPathDuration: 30,
          worstCaseDuration: 30,
          dependencies: '[]',
          asyncWaitTime: 0,
          updatedAt: new Date(),
        },
      })

      expect(task.hasSteps).toBe(true)
      expect(task.completed).toBe(true)
    })
  })

  describe('WorkPattern Operations', () => {
    it('should create a work pattern without patternId in nested objects', async () => {
      const pattern = await prisma.workPattern.create({
        data: {
          id: 'test-pattern-' + Date.now(),
          date: '2025-01-13',
          sessionId: testSessionId,
          isTemplate: false,
          WorkBlock: {
            create: [
              {
                id: 'test-block-' + Date.now(),
                startTime: '09:00',
                endTime: '17:00',
                type: 'focused',
                totalCapacity: 240,
              },
            ],
          },
          WorkMeeting: {
            create: [
              {
                id: 'test-meeting-' + Date.now(),
                name: 'Test Meeting',
                startTime: '10:00',
                endTime: '11:00',
                type: 'meeting',
                recurring: 'none',
              },
            ],
          },
        },
        include: {
          WorkBlock: true,
          WorkMeeting: true,
        },
      })

      expect(pattern).toBeDefined()
      expect(pattern.WorkBlock).toHaveLength(1)
      expect(pattern.WorkMeeting).toHaveLength(1)
      expect(pattern.WorkBlock[0].startTime).toBe('09:00')
      expect(pattern.WorkMeeting[0].name).toBe('Test Meeting')
    })

    it('should save as template correctly', async () => {
      const template = await prisma.workPattern.create({
        data: {
          id: 'test-template-' + Date.now(),
          date: 'template-' + Date.now(),
          sessionId: testSessionId,
          isTemplate: true,
          templateName: 'Test Template',
          WorkBlock: {
            create: [
              {
                id: 'template-block-' + Date.now(),
                startTime: '06:00',
                endTime: '14:00',
                type: 'mixed',
                totalCapacity: 300, // 180 + 120
                splitRatio: JSON.stringify({ focus: 0.6, admin: 0.4 }), // 180/300 = 0.6, 120/300 = 0.4
              },
            ],
          },
        },
        include: {
          WorkBlock: true,
        },
      })

      expect(template.isTemplate).toBe(true)
      expect(template.templateName).toBe('Test Template')
      expect(template.WorkBlock).toHaveLength(1)
    })
  })

  describe('Data Integrity', () => {
    it('should maintain correct data counts', async () => {
      const taskCount = await prisma.task.count({ where: { sessionId: testSessionId } })
      const patternCount = await prisma.workPattern.count({ where: { sessionId: testSessionId } })

      expect(taskCount).toBeGreaterThanOrEqual(2) // We created at least 2 tasks
      expect(patternCount).toBeGreaterThanOrEqual(2) // We created at least 2 patterns
    })

    it('should have required columns in Task table', async () => {
      // This test verifies the schema has the required columns
      const task = await prisma.task.findFirst({ where: { sessionId: testSessionId } })

      if (task) {
        expect(task).toHaveProperty('hasSteps')
        expect(task).toHaveProperty('overallStatus')
        expect(task).toHaveProperty('criticalPathDuration')
        expect(task).toHaveProperty('worstCaseDuration')
        expect(task).toHaveProperty('currentStepId')
      }
    })
  })
})
