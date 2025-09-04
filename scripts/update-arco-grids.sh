#!/bin/bash

# Script to help identify and update Arco Grid components to be responsive
# This generates a report of all Grid/Row/Col usage that needs updating

echo "📊 Arco Grid Responsive Update Report"
echo "======================================"
echo ""

# Find all files using Col with span attribute
echo "🔍 Files using <Col span=...> (need responsive props):"
echo ""

# Search for Col components with span prop
grep -r "Col span=" src/renderer/components --include="*.tsx" --include="*.jsx" | while read -r line; do
    file=$(echo "$line" | cut -d':' -f1)
    content=$(echo "$line" | cut -d':' -f2-)
    
    # Extract the span value
    span=$(echo "$content" | grep -o 'span={[0-9]*}' | grep -o '[0-9]*')
    if [ -z "$span" ]; then
        span=$(echo "$content" | grep -o 'span="[0-9]*"' | grep -o '[0-9]*')
    fi
    
    echo "📁 $(basename "$file")"
    echo "   Current: <Col span={$span}>"
    
    # Suggest responsive values based on span
    case $span in
        24)
            echo "   Suggest: <Col xs={24} sm={24} md={24} lg={24} xl={24}>"
            ;;
        12)
            echo "   Suggest: <Col xs={24} sm={24} md={12} lg={12} xl={12}>"
            ;;
        8)
            echo "   Suggest: <Col xs={24} sm={12} md={8} lg={8} xl={8}>"
            ;;
        6)
            echo "   Suggest: <Col xs={24} sm={12} md={6} lg={6} xl={6}>"
            ;;
        4)
            echo "   Suggest: <Col xs={24} sm={12} md={8} lg={6} xl={4}>"
            ;;
        3)
            echo "   Suggest: <Col xs={24} sm={12} md={6} lg={4} xl={3}>"
            ;;
        *)
            echo "   Suggest: <Col xs={24} sm={12} md={$span} lg={$span} xl={$span}>"
            ;;
    esac
    echo ""
done

echo ""
echo "📊 Summary:"
total=$(grep -r "Col span=" src/renderer/components --include="*.tsx" --include="*.jsx" | wc -l)
echo "   Total Col components to update: $total"

echo ""
echo "🔧 Quick Fix Commands:"
echo ""
echo "# For span={12} (half width) - make full width on mobile:"
echo "find src/renderer/components -name '*.tsx' -exec sed -i '' 's/<Col span={12}>/<Col xs={24} sm={24} md={12} lg={12}>/' {} +"
echo ""
echo "# For span={8} (third width) - responsive thirds:"
echo "find src/renderer/components -name '*.tsx' -exec sed -i '' 's/<Col span={8}>/<Col xs={24} sm={12} md={8} lg={8}>/' {} +"
echo ""
echo "# For span={6} (quarter width) - responsive quarters:"
echo "find src/renderer/components -name '*.tsx' -exec sed -i '' 's/<Col span={6}>/<Col xs={24} sm={12} md={6} lg={6}>/' {} +"
echo ""

echo "⚠️  Note: Review each change carefully as context matters!"
echo "   Some components may need custom breakpoints based on their content."