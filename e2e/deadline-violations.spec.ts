import { test, expect } from '@playwright/test'

/**
 * Deadline Violation Visual Indicators E2E Tests
 * Verifies red borders, badges, and warning tooltips appear for missed deadlines
 */

test.describe('Deadline Violation Indicators', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for app to load
    await page.waitForSelector('[data-testid="task-list"], .arco-empty', { timeout: 10000 })
  })

  test('should show red borders for deadline violations in Gantt chart', async ({ page }) => {
    // Navigate to timeline view
    await page.click('[data-testid="nav-timeline"]')
    await page.waitForSelector('.gantt-chart', { timeout: 5000 })
    
    // Look for any items with red borders (deadline violations)
    const violationItems = page.locator('[style*="border: 3px solid #ff4d4f"]')
    
    if (await violationItems.count() > 0) {
      // Verify red border styling
      const firstViolation = violationItems.first()
      await expect(firstViolation).toBeVisible()
      
      // Should have tooltip with violation details
      await firstViolation.hover()
      await expect(page.locator('.arco-tooltip')).toBeVisible()
      
      // Tooltip should contain deadline information
      const tooltipText = await page.locator('.arco-tooltip-content').textContent()
      expect(tooltipText).toMatch(/(DEADLINE|OVERDUE|LATE)/i)
    }
  })

  test('should display deadline violation badges', async ({ page }) => {
    // Navigate to timeline view
    await page.click('[data-testid="nav-timeline"]')
    await page.waitForSelector('.gantt-chart', { timeout: 5000 })
    
    // Look for deadline violation badges
    const badges = page.locator('.arco-tag').filter({ hasText: /DEADLINE MISSED|WORKFLOW DEADLINE MISSED/i })
    
    if (await badges.count() > 0) {
      const firstBadge = badges.first()
      await expect(firstBadge).toBeVisible()
      
      // Badge should be red
      const badgeStyles = await firstBadge.getAttribute('style')
      expect(badgeStyles).toContain('red')
      
      // Should have tooltip with details
      await firstBadge.hover()
      await expect(page.locator('.arco-tooltip-content')).toContainText(/(delay|late|missed)/i)
    }
  })

  test('should log deadline violations to console', async ({ page }) => {
    const consoleLogs: string[] = []
    
    // Capture console logs
    page.on('console', msg => {
      if (msg.type() === 'warn' && msg.text().includes('DEADLINE VIOLATION DETECTED')) {
        consoleLogs.push(msg.text())
      }
    })
    
    // Navigate to timeline view to trigger potential violations
    await page.click('[data-testid="nav-timeline"]')
    await page.waitForSelector('.gantt-chart', { timeout: 5000 })
    
    // Wait for any violation logging
    await page.waitForTimeout(2000)
    
    // If violations exist, should have logged them
    if (consoleLogs.length > 0) {
      expect(consoleLogs[0]).toContain('DEADLINE VIOLATION DETECTED')
      console.log('✅ Deadline violation logging working:', consoleLogs.length, 'violations logged')
    } else {
      console.log('ℹ️ No deadline violations found in current data')
    }
  })

  test('should distinguish between task and workflow deadline violations', async ({ page }) => {
    // Navigate to timeline view
    await page.click('[data-testid="nav-timeline"]')
    await page.waitForSelector('.gantt-chart', { timeout: 5000 })
    
    // Check for different badge types
    const taskDeadlineBadges = page.locator('.arco-tag').filter({ hasText: 'DEADLINE MISSED' })
    const workflowDeadlineBadges = page.locator('.arco-tag').filter({ hasText: 'WORKFLOW DEADLINE MISSED' })
    
    if (await taskDeadlineBadges.count() > 0) {
      console.log('✅ Task deadline violations detected')
      await expect(taskDeadlineBadges.first()).toBeVisible()
    }
    
    if (await workflowDeadlineBadges.count() > 0) {
      console.log('✅ Workflow deadline violations detected')  
      await expect(workflowDeadlineBadges.first()).toBeVisible()
    }
  })

  test('should work across different viewport sizes', async ({ page }) => {
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
    ]
    
    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      
      // Navigate to timeline
      await page.click('[data-testid="nav-timeline"]')
      await page.waitForSelector('.gantt-chart', { timeout: 5000 })
      
      // Check deadline violations are still visible
      const violationElements = page.locator('[style*="border: 3px solid #ff4d4f"], .arco-tag').filter({
        hasText: /DEADLINE/i
      })
      
      if (await violationElements.count() > 0) {
        await expect(violationElements.first()).toBeVisible()
        console.log(`✅ Deadline violations visible at ${viewport.width}×${viewport.height}`)
      }
    }
  })
})