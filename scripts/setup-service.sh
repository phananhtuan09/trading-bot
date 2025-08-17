#!/bin/bash

# Script setup systemd service
echo "🔧 Setup systemd service cho Trading Bot..."

# Copy service file
sudo cp ../trading-bot.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable trading-bot.service

echo "✅ Systemd service đã được setup!"
echo "📋 Các lệnh quản lý service:"
echo "  sudo systemctl start trading-bot    # Khởi động service"
echo "  sudo systemctl stop trading-bot     # Dừng service"
echo "  sudo systemctl restart trading-bot  # Restart service"
echo "  sudo systemctl status trading-bot   # Kiểm tra trạng thái"
echo "  sudo systemctl disable trading-bot  # Tắt auto-start"
