#!/bin/bash

# Script kiểm tra trạng thái Trading Bot
echo "📊 Trạng thái Trading Bot:"
echo "=========================="

# Hiển thị trạng thái PM2
pm2 status

echo ""
echo "📈 Thông tin chi tiết:"
echo "====================="

# Hiển thị thông tin process
pm2 show trading-bot

echo ""
echo "📋 Logs gần đây:"
echo "==============="

# Hiển thị 10 dòng log cuối
pm2 logs trading-bot --lines 10 --nostream
