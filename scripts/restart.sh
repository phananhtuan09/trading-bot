#!/bin/bash

# Script restart Trading Bot
echo "🔄 Restart Trading Bot..."

# Restart process
pm2 restart trading-bot

echo "✅ Trading Bot đã được restart!"
echo "📊 Xem logs: pm2 logs trading-bot"
