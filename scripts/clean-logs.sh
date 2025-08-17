#!/bin/bash

# Script dọn dẹp logs
echo "🧹 Dọn dẹp logs..."

# Dừng bot trước khi dọn logs
pm2 stop trading-bot

# Xóa logs cũ
rm -rf logs/*
rm -rf ~/.pm2/logs/*

# Tạo lại thư mục logs
mkdir -p logs

# Khởi động lại bot
pm2 start ecosystem.config.js

echo "✅ Đã dọn dẹp logs và khởi động lại bot!"
