#!/bin/bash

# Development script without file watching - for testing while development is in progress
# This prevents the app from refreshing when files change

echo "🚀 Starting Work Capacity Planner WITHOUT file watching..."
echo "📌 The app will NOT refresh when files change"

# Create logs directory if it doesn't exist
LOG_DIR="./logs"
mkdir -p "$LOG_DIR"

# CLEAR ALL OLD LOGS - Fresh start each time to save tokens!
rm -f "$LOG_DIR"/*.log 2>/dev/null
echo "🧹 Cleared old log files for fresh start"

# Generate timestamp for this session
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
SERVER_LOG="$LOG_DIR/server-${TIMESTAMP}.log"
ELECTRON_LOG="$LOG_DIR/electron-${TIMESTAMP}.log"
COMBINED_LOG="$LOG_DIR/combined-${TIMESTAMP}.log"

# Create a named pipe for combining logs
PIPE="/tmp/task-planner-log-pipe-$$"
mkfifo "$PIPE"

# Start log combiner in background
(while true; do cat "$PIPE" >> "$COMBINED_LOG"; done) &
COMBINER_PID=$!

# Function to cleanup on exit
cleanup() {
    echo "🛑 Shutting down..." | tee -a "$COMBINED_LOG"
    
    # Kill all child processes
    pkill -P $$
    
    # Clean up pipe
    rm -f "$PIPE"
    
    # Kill any remaining node processes for this app
    pkill -f "vite.*5174" 2>/dev/null
    pkill -f "electron.*work-capacity-planner" 2>/dev/null
    
    echo "✅ Cleanup complete"
    exit 0
}

# Set up trap for cleanup
trap cleanup INT TERM EXIT

# Kill any existing processes on port 5174
echo "📦 Checking for existing processes..." | tee -a "$COMBINED_LOG"
lsof -ti:5174 | xargs -r kill -9 2>/dev/null

# Build everything first (including renderer)
echo "🔨 Building application..." | tee -a "$COMBINED_LOG"
npm run build:main 2>&1 | tee -a "$COMBINED_LOG"
npm run build:preload 2>&1 | tee -a "$COMBINED_LOG"
npm run build:renderer 2>&1 | tee -a "$COMBINED_LOG"

# Start Vite in preview mode (serves built files, no HMR)
echo "🌐 Starting Vite preview server (no watching)..." | tee -a "$COMBINED_LOG"
npx vite preview --port 5174 2>&1 | tee "$SERVER_LOG" | sed 's/^/[VITE] /' > "$PIPE" &
VITE_PID=$!

# Wait for Vite preview to be ready
echo "⏳ Waiting for preview server to be ready..." | tee -a "$COMBINED_LOG"
while ! curl -s http://localhost:5174 > /dev/null; do
    sleep 1
done
echo "✅ Preview server is ready!" | tee -a "$COMBINED_LOG"

# Start Electron with enhanced logging
echo "🖥️ Starting Electron app..." | tee -a "$COMBINED_LOG"
ELECTRON_ENABLE_LOGGING=1 \
ELECTRON_LOG_FILE="$ELECTRON_LOG" \
NODE_ENV=development \
electron . 2>&1 | tee "$ELECTRON_LOG" | sed 's/^/[ELECTRON] /' > "$PIPE" &
ELECTRON_PID=$!

# Print log locations
echo ""
echo "📝 Logs are being written to:"
echo "   Server:   $SERVER_LOG"
echo "   Electron: $ELECTRON_LOG"
echo "   Combined: $COMBINED_LOG"
echo ""
echo "⚠️  IMPORTANT: The app is running WITHOUT file watching!"
echo "   Changes to code will NOT trigger a refresh."
echo "   To see changes, you must restart the app."
echo ""
echo "💡 Claude Code can read these logs at any time using:"
echo "   cat $COMBINED_LOG    (for all logs)"
echo "   tail -f $COMBINED_LOG (for live monitoring)"
echo ""
echo "🎯 App is running! Use Ctrl+C to stop."
echo ""

# Keep the script running
wait $ELECTRON_PID