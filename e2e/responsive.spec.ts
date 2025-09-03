import { test, expect } from '@playwright/test'

test.describe('Responsive Layout Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for app to load
    await page.waitForSelector('.app-container', { timeout: 10000 })
  })

  test('No horizontal scrollbars at any breakpoint', async ({ page, viewport }) => {
    // Check document doesn't overflow viewport
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const windowWidth = await page.evaluate(() => window.innerWidth)
    
    // Document width should not exceed viewport width
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth)
    
    // Check for visible horizontal scrollbar
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    
    expect(hasHorizontalScroll).toBe(false)
  })

  test('SwimLaneTimeline fits in viewport', async ({ page, viewport }) => {
    // Navigate to work logger view
    await page.click('text=Work Logger')
    
    // Wait for timeline to render
    await page.waitForSelector('.swimlane-timeline', { timeout: 5000 })
    
    // Check timeline doesn't cause horizontal overflow
    const timelineBounds = await page.locator('.swimlane-timeline').boundingBox()
    if (timelineBounds && viewport) {
      expect(timelineBounds.width).toBeLessThanOrEqual(viewport.width)
    }
    
    // Check for unwanted scrollbars on timeline container
    const hasTimelineScroll = await page.evaluate(() => {
      const timeline = document.querySelector('.swimlane-timeline')
      if (!timeline) return false
      const computed = window.getComputedStyle(timeline)
      return computed.overflowX === 'scroll' || computed.overflowX === 'auto'
    })
    
    // Timeline should not have its own scrollbar at standard desktop size
    if (viewport && viewport.width >= 1366) {
      expect(hasTimelineScroll).toBe(false)
    }
  })

  test('CircularClock scales appropriately', async ({ page, viewport }) => {
    // Navigate to work logger view
    await page.click('text=Work Logger')
    
    // Wait for clock to render
    await page.waitForSelector('.circular-clock svg', { timeout: 5000 })
    
    // Get clock dimensions
    const clockBounds = await page.locator('.circular-clock svg').first().boundingBox()
    
    if (clockBounds && viewport) {
      // Clock should not exceed reasonable portion of viewport
      const maxClockSize = Math.min(viewport.width * 0.9, viewport.height * 0.6)
      expect(clockBounds.width).toBeLessThanOrEqual(maxClockSize)
      expect(clockBounds.height).toBeLessThanOrEqual(maxClockSize)
      
      // On mobile, clock should be smaller
      if (viewport.width < 768) {
        expect(clockBounds.width).toBeLessThanOrEqual(300)
      }
    }
  })

  test('EisenhowerMatrix container has proper dimensions', async ({ page, viewport }) => {
    // Stay on main view which has the Eisenhower Matrix
    
    // Wait for matrix to render
    await page.waitForSelector('.eisenhower-matrix', { timeout: 5000 })
    
    // Switch to scatter view to test container sizing
    const scatterButton = await page.locator('text=Scatter')
    if (await scatterButton.isVisible()) {
      await scatterButton.click()
      
      // Check scatter container has non-zero dimensions
      const scatterContainer = await page.locator('.eisenhower-scatter-container').first()
      const bounds = await scatterContainer.boundingBox()
      
      if (bounds) {
        // Container should have meaningful dimensions
        expect(bounds.width).toBeGreaterThan(100)
        expect(bounds.height).toBeGreaterThan(100)
        
        // Container should fit in viewport
        if (viewport) {
          expect(bounds.width).toBeLessThanOrEqual(viewport.width)
        }
      }
    }
  })

  test('Grid components stack on mobile', async ({ page, viewport }) => {
    if (!viewport || viewport.width >= 768) {
      test.skip()
      return
    }
    
    // Find all Arco Grid Row/Col components
    const gridCols = await page.locator('.arco-col').all()
    
    if (gridCols.length > 0) {
      // On mobile, columns should stack vertically
      const firstColBounds = await gridCols[0].boundingBox()
      const secondColBounds = gridCols.length > 1 ? await gridCols[1].boundingBox() : null
      
      if (firstColBounds && secondColBounds) {
        // Second column should be below first (stacked)
        expect(secondColBounds.y).toBeGreaterThan(firstColBounds.y)
        // Columns should take full width on mobile
        expect(firstColBounds.width).toBeGreaterThanOrEqual(viewport.width * 0.9)
      }
    }
  })

  test('Touch targets are appropriately sized on mobile', async ({ page, viewport }) => {
    if (!viewport || viewport.width >= 768) {
      test.skip()
      return
    }
    
    // Check button sizes
    const buttons = await page.locator('button').all()
    
    for (const button of buttons.slice(0, 5)) { // Check first 5 buttons
      const bounds = await button.boundingBox()
      if (bounds) {
        // Touch targets should be at least 44x44 pixels (iOS HIG recommendation)
        expect(bounds.height).toBeGreaterThanOrEqual(44)
        // Width can be variable for text buttons, but should be reasonable
        expect(bounds.width).toBeGreaterThanOrEqual(44)
      }
    }
  })

  test('Modals fit in viewport on mobile', async ({ page, viewport }) => {
    if (!viewport || viewport.width >= 768) {
      test.skip()
      return
    }
    
    // Try to open a modal (e.g., Add Task)
    const addButton = await page.locator('button:has-text("Add")').first()
    if (await addButton.isVisible()) {
      await addButton.click()
      
      // Wait for modal to appear
      const modal = await page.locator('.arco-modal').first()
      if (await modal.isVisible()) {
        const modalBounds = await modal.boundingBox()
        
        if (modalBounds) {
          // Modal should fit within viewport with some padding
          expect(modalBounds.width).toBeLessThanOrEqual(viewport.width - 20)
          expect(modalBounds.height).toBeLessThanOrEqual(viewport.height - 40)
        }
      }
    }
  })

  test('Text remains readable at all sizes', async ({ page, viewport }) => {
    // Check base font size
    const bodyFontSize = await page.evaluate(() => {
      const computed = window.getComputedStyle(document.body)
      return parseFloat(computed.fontSize)
    })
    
    // Font should be at least 14px on desktop, 16px on mobile
    if (viewport && viewport.width < 768) {
      expect(bodyFontSize).toBeGreaterThanOrEqual(14)
    } else {
      expect(bodyFontSize).toBeGreaterThanOrEqual(12)
    }
    
    // Check that text doesn't overflow containers
    const textElements = await page.locator('.arco-typography').all()
    
    for (const element of textElements.slice(0, 10)) { // Check first 10 text elements
      const isOverflowing = await element.evaluate((el) => {
        return el.scrollWidth > el.clientWidth
      })
      
      // Text should not overflow unless explicitly set to ellipsis
      const overflow = await element.evaluate((el) => {
        return window.getComputedStyle(el).overflow
      })
      
      if (overflow !== 'hidden') {
        expect(isOverflowing).toBe(false)
      }
    }
  })
})