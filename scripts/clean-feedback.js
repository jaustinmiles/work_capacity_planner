#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the feedback file
const feedbackPath = path.join(process.cwd(), 'context', 'feedback.json');
const rawData = fs.readFileSync(feedbackPath, 'utf-8');
const data = JSON.parse(rawData);

// Flatten and deduplicate
const allItems = [];
const seen = new Set();

function extractItems(item) {
  if (Array.isArray(item)) {
    item.forEach(extractItems);
  } else if (item && typeof item === 'object' && 'type' in item) {
    // Create a unique key for deduplication
    const key = `${item.timestamp}-${item.sessionId}`;
    if (!seen.has(key)) {
      seen.add(key);
      allItems.push(item);
    }
  }
}

// Process all data
if (Array.isArray(data)) {
  data.forEach(extractItems);
}

// Sort by timestamp (newest first)
allItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

// Write back cleaned data
fs.writeFileSync(feedbackPath, JSON.stringify(allItems, null, 2));

console.log(`✅ Cleaned feedback data:`);
console.log(`   - Original nested structure flattened`);
console.log(`   - Removed duplicates`); 
console.log(`   - Total unique items: ${allItems.length}`);
console.log(`   - Saved to: ${feedbackPath}`);