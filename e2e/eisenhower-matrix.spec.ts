import { test, expect } from '@playwright/test'

test.describe('EisenhowerMatrix E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the Eisenhower Matrix page
    await page.goto('/')

    // Wait for app to load
    await page.waitForSelector('.arco-menu', { timeout: 10000 })

    // Navigate to Eisenhower Matrix (clicking on the sidebar menu item)
    await page.click('text=Eisenhower Matrix')
    await page.waitForLoadState('networkidle')
  })

  test('should display EisenhowerMatrix in grid view by default', async ({ page }) => {
    // Check for the matrix title
    await expect(page.locator('text=Eisenhower Priority Matrix')).toBeVisible()

    // Check for grid quadrants (using more specific selectors to avoid conflicts)
    await expect(page.locator('h6:has-text("Do First")')).toBeVisible()
    await expect(page.locator('h6:has-text("Schedule")')).toBeVisible()
    await expect(page.locator('h6:has-text("Delegate")')).toBeVisible()
    await expect(page.locator('h6:has-text("Eliminate")')).toBeVisible()

    // Check for axis labels
    await expect(page.locator('text=/Less Urgent.*More Urgent/')).toBeVisible()
    await expect(page.locator('text=/Less Important.*More Important/')).toBeVisible()
  })

  test('should switch between grid and scatter views', async ({ page }) => {
    // Initially in grid view
    await expect(page.locator('h6:has-text("Do First")')).toBeVisible()

    // Switch to scatter view (wait for element to be visible and clickable)
    const scatterRadio = page.locator('input[value="scatter"]')
    await expect(scatterRadio).toBeVisible()
    await scatterRadio.click()

    // Wait for scatter view to render
    await page.waitForTimeout(500)

    // Check for scatter view elements
    await expect(page.locator('text=Urgency →')).toBeVisible()
    await expect(page.locator('text=Importance →')).toBeVisible()

    // Check for scan button (scatter view specific)
    await expect(page.locator('button:has-text("Scan")')).toBeVisible()

    // Switch back to grid view
    const gridRadio = page.locator('input[value="grid"]')
    await expect(gridRadio).toBeVisible()
    await gridRadio.click()

    // Verify grid view is back
    await expect(page.locator('h6:has-text("Do First")')).toBeVisible()
    await expect(page.locator('h6:has-text("Schedule")')).toBeVisible()
  })

  test('should handle zoom controls in grid view', async ({ page }) => {
    // Look for zoom controls
    const zoomInButton = page.locator('.arco-icon-zoom-in').first()
    const zoomOutButton = page.locator('.arco-icon-zoom-out').first()

    // Check if zoom controls are visible (depends on viewport width)
    const zoomInVisible = await zoomInButton.isVisible().catch(() => false)

    if (zoomInVisible) {
      // Get initial slider value
      const slider = page.locator('.arco-slider').first()
      const initialValue = await slider.getAttribute('aria-valuenow')

      // Click zoom in
      await zoomInButton.click()

      // Check that slider value increased
      const newValue = await slider.getAttribute('aria-valuenow')
      expect(parseFloat(newValue || '0')).toBeGreaterThan(parseFloat(initialValue || '0'))

      // Click zoom out
      await zoomOutButton.click()

      // Check that slider value decreased
      const finalValue = await slider.getAttribute('aria-valuenow')
      expect(parseFloat(finalValue || '0')).toBeLessThanOrEqual(parseFloat(newValue || '0'))
    }
  })

  test('should run diagonal scan in scatter view', async ({ page }) => {
    // Switch to scatter view (check visibility first)
    const scatterRadio = page.locator('input[value="scatter"]')
    await expect(scatterRadio).toBeVisible()
    await scatterRadio.click()
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
    // Switch to scatter view (check visibility first)
    const scatterRadio = page.locator('input[value="scatter"]')
    await expect(scatterRadio).toBeVisible()
    await scatterRadio.click()
    await page.waitForTimeout(500)

    // Find debug button
    const debugButton = page.locator('button:has-text("Debug OFF")')
    await expect(debugButton).toBeVisible()

    // Click to enable debug mode
    await debugButton.click()

    // Check that debug mode is enabled
    await expect(page.locator('button:has-text("Debug ON")')).toBeVisible()

    // Click again to disable
    await page.locator('button:has-text("Debug ON")').click()

    // Verify debug mode is disabled
    await expect(page.locator('button:has-text("Debug OFF")')).toBeVisible()
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
      const gridRadio = page.locator('input[value="grid"]')
      const scatterRadio = page.locator('input[value="scatter"]')

      await expect(gridRadio).toBeAttached()
      await expect(scatterRadio).toBeAttached()

      // For mobile, check if text labels are hidden
      if (viewport.name === 'Mobile') {
        // On mobile, some text might be hidden - use first() to avoid multiple elements
        const addTaskButton = page.locator('.arco-icon-plus').first()
        await expect(addTaskButton).toBeVisible()
      }
    }
  })

  test('should maintain state when switching views', async ({ page }) => {
    // Start in grid view
    await expect(page.locator('text=Do First')).toBeVisible()

    // Switch to scatter view
    await page.click('input[value="scatter"]')
    await page.waitForTimeout(500)

    // Enable debug mode
    const debugButton = page.locator('button:has-text("Debug OFF")')
    await debugButton.click()
    await expect(page.locator('button:has-text("Debug ON")')).toBeVisible()

    // Switch back to grid view
    await page.click('input[value="grid"]')
    await page.waitForTimeout(500)

    // Switch back to scatter view
    await page.click('input[value="scatter"]')
    await page.waitForTimeout(500)

    // Debug mode should be reset (not persisted)
    await expect(page.locator('button:has-text("Debug OFF")')).toBeVisible()
  })
})
