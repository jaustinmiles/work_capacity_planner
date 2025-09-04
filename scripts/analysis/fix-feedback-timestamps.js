#!/usr/bin/env node

/**
 * Script to fix duplicate timestamps in feedback.json
 * Ensures each item has a unique timestamp for proper UI selection
 */

const fs = require('fs')
const path = require('path')

const FEEDBACK_FILE = path.join(__dirname, '..', '..', 'context', 'feedback.json')

function loadFeedback() {
  try {
    const data = fs.readFileSync(FEEDBACK_FILE, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error loading feedback.json:', error.message)
    process.exit(1)
  }
}

function saveFeedback(feedback) {
  try {
    const data = JSON.stringify(feedback, null, 2)
    fs.writeFileSync(FEEDBACK_FILE, data, 'utf8')
    console.log(`✅ Saved ${feedback.length} items to feedback.json`)
  } catch (error) {
    console.error('Error saving feedback.json:', error.message)
    process.exit(1)
  }
}

function main() {
  console.log('🔧 Fixing duplicate timestamps in feedback.json...')
  const feedback = loadFeedback()
  console.log(`  Found ${feedback.length} total items`)

  // Group items by sessionId + timestamp to find duplicates
  const groups = new Map()
  feedback.forEach((item, index) => {
    const key = `${item.sessionId}-${item.timestamp}`
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key).push({ item, index })
  })

  // Find groups with duplicates
  let fixedCount = 0
  groups.forEach((group, key) => {
    if (group.length > 1) {
      console.log(`  Found ${group.length} items with duplicate key: ${key}`)

      // Fix timestamps by adding milliseconds
      const baseTime = new Date(group[0].item.timestamp).getTime()
      group.forEach(({ index }, groupIndex) => {
        if (groupIndex > 0) {
          // Add 100ms for each duplicate to ensure uniqueness
          const newTimestamp = new Date(baseTime + (groupIndex * 100))
          feedback[index].timestamp = newTimestamp.toISOString()
          fixedCount++
        }
      })
    }
  })

  if (fixedCount > 0) {
    console.log(`\n📝 Fixed ${fixedCount} duplicate timestamps`)
    saveFeedback(feedback)
    console.log('✨ All feedback items now have unique timestamps!')
  } else {
    console.log('✨ No duplicate timestamps found - feedback.json is already correct!')
  }

  // Verify uniqueness
  const uniqueKeys = new Set()
  let duplicatesRemain = false
  feedback.forEach(item => {
    const key = `${item.sessionId}-${item.timestamp}`
    if (uniqueKeys.has(key)) {
      console.error(`❌ ERROR: Duplicate key still exists: ${key}`)
      duplicatesRemain = true
    }
    uniqueKeys.add(key)
  })

  if (!duplicatesRemain) {
    console.log('✅ Verification passed: All items have unique IDs')
  } else {
    console.error('❌ Verification failed: Duplicates still exist!')
    process.exit(1)
  }
}

main()
