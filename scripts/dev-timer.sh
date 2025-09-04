#!/bin/bash

# Development Timer Script
# Usage: ./scripts/dev-timer.sh start "Phase 1.1"
#        ./scripts/dev-timer.sh check
#        ./scripts/dev-timer.sh stop

TIMER_FILE="/tmp/dev-timer.txt"

case "$1" in
  start)
    echo "$(date '+%s') $2" > "$TIMER_FILE"
    echo "⏱️  Started timer for: $2"
    echo "🕐 Start time: $(date '+%H:%M:%S')"
    ;;
  check)
    if [ -f "$TIMER_FILE" ]; then
      START_TIME=$(cut -d' ' -f1 "$TIMER_FILE")
      TASK_NAME=$(cut -d' ' -f2- "$TIMER_FILE")
      CURRENT_TIME=$(date '+%s')
      ELAPSED=$((CURRENT_TIME - START_TIME))
      MINUTES=$((ELAPSED / 60))
      SECONDS=$((ELAPSED % 60))
      echo "⏱️  Task: $TASK_NAME"
      echo "⏱️  Elapsed: ${MINUTES}m ${SECONDS}s"
    else
      echo "❌ No timer running"
    fi
    ;;
  stop)
    if [ -f "$TIMER_FILE" ]; then
      START_TIME=$(cut -d' ' -f1 "$TIMER_FILE")
      TASK_NAME=$(cut -d' ' -f2- "$TIMER_FILE")
      CURRENT_TIME=$(date '+%s')
      ELAPSED=$((CURRENT_TIME - START_TIME))
      MINUTES=$((ELAPSED / 60))
      SECONDS=$((ELAPSED % 60))
      echo "✅ Completed: $TASK_NAME"
      echo "⏱️  Total time: ${MINUTES}m ${SECONDS}s"
      rm "$TIMER_FILE"
    else
      echo "❌ No timer running"
    fi
    ;;
  *)
    echo "Usage: $0 {start|check|stop}"
    exit 1
    ;;
esac