#!/bin/bash

# Script khởi động Trading Bot
echo "🚀 Khởi động Trading Bot..."

# Kiểm tra file .env
if [ ! -f .env ]; then
    echo "❌ File .env không tồn tại!"
    echo "Vui lòng tạo file .env từ env.example và cấu hình API keys"
    exit 1
fi

# Kiểm tra PM2 đã cài đặt chưa
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 chưa được cài đặt. Đang cài đặt..."
    sudo npm install -g pm2
fi

# Dừng process cũ nếu có
pm2 delete trading-bot 2>/dev/null || true

# Khởi động bot với PM2
pm2 start ecosystem.config.js

echo "✅ Trading Bot đã được khởi động!"
echo "📊 Xem logs: pm2 logs trading-bot"
echo "📈 Monitor: pm2 monit"
