#!/bin/bash

# Script dừng Trading Bot
echo "🛑 Dừng Trading Bot..."

# Dừng process
pm2 stop trading-bot

echo "✅ Trading Bot đã được dừng!"
echo "📊 Trạng thái: pm2 status"
