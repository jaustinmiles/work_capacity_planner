import { test, expect } from '@playwright/test'
import { mockElectronAPI } from './fixtures/electron-mock'

test.describe('Simple Responsive Tests', () => {
  test('App loads without horizontal scrollbar at 1366x768', async ({ page }) => {
    // Set viewport to the problematic size
    await page.setViewportSize({ width: 1366, height: 768 })

    // Mock Electron API
    await mockElectronAPI(page)

    // Navigate to app
    await page.goto('/')

    // Wait for app to be ready
    await page.waitForTimeout(3000)

    // Check for horizontal scrollbar
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })

    expect(hasHorizontalScroll).toBe(false)
  })

  test('SwimLaneTimeline fits at 1366x768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await mockElectronAPI(page)
    await page.goto('/')
    await page.waitForTimeout(2000)

    // Navigate to Work Logger if button exists
    const workLoggerButton = page.getByText('Log Work')
    if (await workLoggerButton.isVisible()) {
      await workLoggerButton.click()
      await page.waitForTimeout(2000)
    }

    // Check if timeline exists and fits
    const timeline = page.locator('.swimlane-timeline').first()
    if (await timeline.isVisible()) {
      const box = await timeline.boundingBox()
      if (box) {
        expect(box.width).toBeLessThanOrEqual(1366)
      }
    }
  })

  test('Mobile view at 375px works', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await mockElectronAPI(page)
    await page.goto('/')
    await page.waitForTimeout(3000)

    // Check no horizontal scroll on mobile
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })

    expect(hasHorizontalScroll).toBe(false)
  })
})
