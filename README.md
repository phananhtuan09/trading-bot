# Crypto Trading Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Một bot giao dịch crypto tự động sử dụng dữ liệu từ Binance và tích hợp thông báo qua Discord và Telegram

## 📌 Tính năng chính

- Kết nối API Binance để lấy dữ liệu thị trường
- 2 chiến lược giao dịch tích hợp sẵn:
  - Breakout Trading
  - Bollinger Bands
- Gửi thông báo tín hiệu qua Discord và Telegram
- Quét tín hiệu 5 phút/lần

## 🚀 Yêu cầu hệ thống

- Node.js 20.14.0
- Discord Bot Token
- Binance API Keys
- Discord Server
- Telegram Bot Token

## ⚙️ Cài đặt

## 1. Cài đặt dependencies

```bash
npm install
```

## 2. Cấu hình môi trường

Cập nhật file .env trong thư mục gốc với nội dung:

```bash
DISCORD_TOKEN=
DISCORD_CHANNEL_ID=
BINANCE_API_KEY=
BINANCE_API_SECRET=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

## 🏃 Chạy ứng dụng

```bash
npm start
```

## 🔧 Cấu hình chiến lược

Chỉnh sửa các thông số chiến lược trong file `config.js` (phần STRATEGY_CONFIG):
