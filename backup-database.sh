#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backups/verified/backup_${TIMESTAMP}.db"
cp prisma/dev.db "$BACKUP_FILE"
echo "Database backed up to: $BACKUP_FILE"
sqlite3 "$BACKUP_FILE" "SELECT COUNT(*) || ' tasks' FROM Task UNION ALL SELECT COUNT(*) || ' workflows' FROM SequencedTask" 2>/dev/null
