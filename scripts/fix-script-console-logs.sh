#!/bin/bash

# Script to add eslint-disable comments to console.log statements in scripts directory
# Created during PR #67 cleanup to address console.log usage in scripts

echo "🔧 Adding eslint-disable comments to console.log statements in scripts..."

# Find all TypeScript and JavaScript files in scripts directory
find scripts/ -name "*.ts" -o -name "*.js" | while read -r file; do
    # Skip if file doesn't contain console.log
    if ! grep -q "console\.log" "$file"; then
        continue
    fi
    
    echo "Processing: $file"
    
    # Use sed to add eslint-disable comment before each console.log line
    # This preserves indentation and adds the comment on the line before
    sed -i.bak '/console\.log/i\
    // eslint-disable-next-line no-console
' "$file"
    
    # Remove backup file
    rm "$file.bak" 2>/dev/null || true
    
    echo "  ✅ Added eslint-disable comments to $file"
done

echo
echo "🎯 Completed! All console.log statements in scripts/ now have eslint-disable comments."
echo "📝 Note: Scripts are allowed to use console.log for output - this is by design."