#!/bin/bash

# Script backup Trading Bot
BACKUP_DIR="/home/anhtuan/backups/trading_bot"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="trading_bot_backup_$DATE.tar.gz"

echo "💾 Bắt đầu backup Trading Bot..."

# Tạo thư mục backup nếu chưa có
mkdir -p $BACKUP_DIR

# Dừng bot trước khi backup
pm2 stop trading-bot

# Tạo backup
tar -czf $BACKUP_DIR/$BACKUP_NAME \
    --exclude=node_modules \
    --exclude=logs \
    --exclude=.git \
    --exclude=*.log \
    .

# Khởi động lại bot
pm2 start ecosystem.config.js

# Xóa backup cũ (giữ lại 7 ngày gần nhất)
find $BACKUP_DIR -name "trading_bot_backup_*.tar.gz" -mtime +7 -delete

echo "✅ Backup hoàn tất: $BACKUP_DIR/$BACKUP_NAME"
echo "📊 Kích thước: $(du -h $BACKUP_DIR/$BACKUP_NAME | cut -f1)"
