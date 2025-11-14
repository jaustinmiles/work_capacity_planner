import { test, expect } from '@playwright/test'
import { mockElectronAPI } from './fixtures/electron-mock'

test.describe('EisenhowerMatrix E2E Tests', () => {
  test.beforeEach(async ({ page, viewport }) => {
    // Mock Electron API before navigation
    await mockElectronAPI(page)

    // Navigate to the Eisenhower Matrix page
    await page.goto('/')

    // Wait for app to load
    await page.waitForSelector('.arco-menu', { timeout: 10000 })

    // On mobile viewports, the menu might be collapsed
    // Check if we need to open the hamburger menu first
    if (viewport && viewport.width < 768) {
      // Look for hamburger menu icon
      const hamburger = page.locator('.arco-icon-menu-fold, .arco-icon-menu-unfold').first()
      const isHamburgerVisible = await hamburger.isVisible().catch(() => false)
      if (isHamburgerVisible) {
        await hamburger.click()
        await page.waitForTimeout(300) // Wait for menu animation
      }
    }

    // Navigate to Eisenhower Matrix (clicking on the sidebar menu item)
    await page.click('text=Eisenhower Matrix')
    await page.waitForLoadState('networkidle')
  })

  test('should display EisenhowerMatrix in scatter view by default', async ({ page }, testInfo) => {
    // Skip mobile viewports
    if (testInfo.project.name === 'Mobile Small' || testInfo.project.name === 'Mobile Large') {
      test.skip()
      return
    }

    // Check for the matrix title
    await expect(page.locator('text=Eisenhower Priority Matrix')).toBeVisible()

    // Wait for scatter view to render (default view)
    await page.waitForTimeout(500)

    // Check for scatter view elements
    await expect(page.locator('text=Urgency →')).toBeVisible()
    await expect(page.locator('text=Importance →')).toBeVisible()

    // Check for scan button (scatter view specific)
    await expect(page.locator('button:has-text("Scan")')).toBeVisible()
  })

  test('should switch between grid and scatter views', async ({ page }, testInfo) => {
    // Skip mobile viewports
    if (testInfo.project.name === 'Mobile Small' || testInfo.project.name === 'Mobile Large') {
      test.skip()
      return
    }

    // Verify we start in scatter view (default)
    await page.waitForTimeout(500)
    await expect(page.locator('text=Urgency →')).toBeVisible()
    await expect(page.locator('text=Importance →')).toBeVisible()

    // Switch to grid view using Arco button-style radio
    const gridButton = page.locator('.arco-radio-button').filter({ hasText: 'Grid' })
    await gridButton.click()

    // Wait for grid view to render
    await page.waitForTimeout(500)

    // Check for grid view elements
    await expect(page.locator('text="Do First"')).toBeVisible()
    await expect(page.locator('text="Schedule"')).toBeVisible()
    await expect(page.locator('text="Delegate"')).toBeVisible()
    await expect(page.locator('text="Eliminate"')).toBeVisible()

    // Switch back to scatter view
    const scatterButton = page.locator('.arco-radio-button').filter({ hasText: 'Scatter' })
    await scatterButton.click()
    await page.waitForTimeout(500)

    // Verify scatter view is back
    await expect(page.locator('text=Urgency →')).toBeVisible()
    await expect(page.locator('text=Importance →')).toBeVisible()
  })

  test('should handle zoom controls in grid view', async ({ page }, testInfo) => {
    // Skip mobile viewports
    if (testInfo.project.name === 'Mobile Small' || testInfo.project.name === 'Mobile Large') {
      test.skip()
      return
    }

    // Ensure we're in grid view
    const gridButton = page.locator('.arco-radio-button').filter({ hasText: 'Grid' })
    await gridButton.click()
    await page.waitForTimeout(500)

    // Look for zoom controls
    const zoomInButton = page.locator('.arco-icon-zoom-in').first()
    const zoomOutButton = page.locator('.arco-icon-zoom-out').first()

    // Check if zoom controls are visible (depends on viewport width)
    const zoomInVisible = await zoomInButton.isVisible().catch(() => false)

    if (zoomInVisible) {
      // Get initial slider value from the slider button/handle
      const sliderButton = page.locator('.arco-slider-button').first()
      const initialValue = await sliderButton.getAttribute('aria-valuenow')

      // Click zoom in
      await zoomInButton.click()
      await page.waitForTimeout(300) // Wait for slider animation

      // Check that slider value increased
      const newValue = await sliderButton.getAttribute('aria-valuenow')
      expect(parseFloat(newValue || '0')).toBeGreaterThan(parseFloat(initialValue || '0'))

      // Click zoom out
      await zoomOutButton.click()
      await page.waitForTimeout(300) // Wait for slider animation

      // Check that slider value decreased
      const finalValue = await sliderButton.getAttribute('aria-valuenow')
      expect(parseFloat(finalValue || '0')).toBeLessThanOrEqual(parseFloat(newValue || '0'))
    }
  })

  test('should run diagonal scan in scatter view', async ({ page }) => {
    // Switch to scatter view using Arco button-style radio
    const scatterButton = page.locator('.arco-radio-button').filter({ has: page.locator('.arco-icon-drag-dot') })
    await scatterButton.click()
    await page.waitForTimeout(500)

    // Find and click scan button
    const scanButton = page.locator('button:has-text("Scan")')
    await expect(scanButton).toBeVisible()

    // Start scanning
    await scanButton.click()

    // Check that button text changes to indicate scanning
    await expect(page.locator('button:has-text("Scan...")')).toBeVisible({ timeout: 2000 })

    // Wait a moment for scan to progress
    await page.waitForTimeout(1000)

    // Stop scanning
    await page.locator('button:has-text("Scan...")').click()

    // Verify scan stopped
    await expect(page.locator('button:has-text("Scan")')).toBeVisible()
  })

  test('should toggle debug mode in scatter view', async ({ page }) => {
    // Switch to scatter view using Arco button-style radio
    const scatterButton = page.locator('.arco-radio-button').filter({ has: page.locator('.arco-icon-drag-dot') })
    await scatterButton.click()
    await page.waitForTimeout(500)

    // Find debug button (includes emoji)
    const debugButton = page.locator('button:has-text("🔍 Debug OFF")')
    await expect(debugButton).toBeVisible()

    // Click to enable debug mode
    await debugButton.click()

    // Check that debug mode is enabled
    await expect(page.locator('button:has-text("🔍 Debug ON")')).toBeVisible()

    // Click again to disable
    await page.locator('button:has-text("🔍 Debug ON")').click()

    // Verify debug mode is disabled
    await expect(page.locator('button:has-text("🔍 Debug OFF")')).toBeVisible()
  })

  test('should be responsive to viewport changes', async ({ page }) => {
    // Test at different viewport sizes
    const viewportSizes = [
      { width: 1366, height: 768, name: 'Desktop' },
      { width: 768, height: 1024, name: 'Tablet' },
      { width: 375, height: 667, name: 'Mobile' },
    ]

    for (const viewport of viewportSizes) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })

      // Wait for resize to take effect
      await page.waitForTimeout(500)

      // Check that matrix title is still visible
      await expect(page.locator('text=Eisenhower Priority Matrix')).toBeVisible()

      // Check that view mode controls are accessible
      // Check for the radio buttons with icons
      const gridButton = page.locator('.arco-radio-button').filter({ has: page.locator('.arco-icon-apps') })
      const scatterButton = page.locator('.arco-radio-button').filter({ has: page.locator('.arco-icon-drag-dot') })
      await expect(gridButton).toBeAttached()
      await expect(scatterButton).toBeAttached()

      // For mobile, check if text labels are hidden
      if (viewport.name === 'Mobile') {
        // On mobile, some text might be hidden - use first() to avoid multiple elements
        const addTaskButton = page.locator('.arco-icon-plus').first()
        await expect(addTaskButton).toBeVisible()
      }
    }
  })

  test('should maintain state when switching views', async ({ page }, testInfo) => {
    // Skip mobile viewports
    if (testInfo.project.name === 'Mobile Small' || testInfo.project.name === 'Mobile Large') {
      test.skip()
      return
    }

    // Verify we start in scatter view (default)
    await page.waitForTimeout(500)
    await expect(page.locator('text=Urgency →')).toBeVisible()
    await expect(page.locator('text=Importance →')).toBeVisible()

    // Switch to grid view
    const gridButton = page.locator('.arco-radio-button').filter({ hasText: 'Grid' })
    await gridButton.click()
    await page.waitForTimeout(500)

    // Wait for grid view to be fully loaded
    await expect(page.locator('text=Do First')).toBeVisible()
    await expect(page.locator('text=Schedule')).toBeVisible()

    // Switch back to scatter view
    const scatterButton = page.locator('.arco-radio-button').filter({ hasText: 'Scatter' })
    await scatterButton.click()
    await page.waitForTimeout(500)

    // Verify we're back in scatter view
    await expect(page.locator('text=Urgency →')).toBeVisible()
    await expect(page.locator('text=Importance →')).toBeVisible()

    // Switch back to grid view again
    await gridButton.click()
    await page.waitForTimeout(500)

    // Verify grid view is fully loaded again
    await expect(page.locator('text=Do First')).toBeVisible()
    await expect(page.locator('text=Schedule')).toBeVisible()
  })
})
