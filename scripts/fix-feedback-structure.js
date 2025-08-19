#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

// Read the feedback file
const feedbackPath = path.join(process.cwd(), 'context', 'feedback.json')
const rawData = fs.readFileSync(feedbackPath, 'utf-8')
const data = JSON.parse(rawData)

// Flatten and deduplicate
const allItems = []
const seen = new Map() // Use map to track and keep the newest version

function extractItems(item) {
  if (Array.isArray(item)) {
    item.forEach(extractItems)
  } else if (item && typeof item === 'object' && 'type' in item && 'timestamp' in item) {
    // Create a unique key based on content (not timestamp/session)
    // This ensures we dedupe actual duplicate content
    const contentKey = `${item.type}-${item.title}-${item.priority}`

    // Keep the newest version of duplicates
    const existing = seen.get(contentKey)
    if (!existing || new Date(item.timestamp) > new Date(existing.timestamp)) {
      seen.set(contentKey, item)
    }
  }
}

// Process all data recursively
if (Array.isArray(data)) {
  data.forEach(extractItems)
} else {
  extractItems(data)
}

// Get unique items and sort by timestamp (newest first)
const uniqueItems = Array.from(seen.values())
uniqueItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

// Write back cleaned data
fs.writeFileSync(feedbackPath, JSON.stringify(uniqueItems, null, 2))

console.log('✅ Fixed feedback structure:')
console.log('   - Flattened nested arrays')
console.log('   - Removed content duplicates (kept newest)')
console.log(`   - Total unique items: ${uniqueItems.length}`)

// Show summary
const byType = {}
uniqueItems.forEach(item => {
  byType[item.type] = (byType[item.type] || 0) + 1
})
console.log('   - By type:', byType)
