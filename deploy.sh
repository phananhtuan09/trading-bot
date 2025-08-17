#!/bin/bash

# Trading Bot Deployment Script
# Sử dụng: ./deploy.sh

set -e

echo "🚀 Bắt đầu deployment Trading Bot..."

# Kiểm tra Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js chưa được cài đặt. Đang cài đặt..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Kiểm tra PM2
if ! command -v pm2 &> /dev/null; then
    echo "📦 Đang cài đặt PM2..."
    sudo npm install -g pm2
fi

# Cài đặt dependencies
echo "📦 Đang cài đặt dependencies..."
npm install

# Tạo thư mục logs nếu chưa có
mkdir -p logs

# Kiểm tra file .env
if [ ! -f .env ]; then
    echo "⚠️  File .env chưa tồn tại. Vui lòng tạo file .env từ env.example"
    echo "cp env.example .env"
    echo "Sau đó chỉnh sửa các thông tin API key trong file .env"
    exit 1
fi

# Kiểm tra quyền thực thi
chmod +x deploy.sh
chmod +x scripts/*.sh

echo "✅ Deployment hoàn tất!"
echo ""
echo "📋 Các lệnh hữu ích:"
echo "  pm2 start ecosystem.config.js    # Khởi động bot"
echo "  pm2 stop trading-bot             # Dừng bot"
echo "  pm2 restart trading-bot          # Restart bot"
echo "  pm2 logs trading-bot             # Xem logs"
echo "  pm2 monit                        # Monitor real-time"
echo "  pm2 delete trading-bot           # Xóa process"
