# Crypto Trading Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Bot giao dịch crypto tự động bắt tín hiệu từ Binance để đặt lệnh feature, tích hợp thông báo qua Discord và Telegram

## 📌 Tính năng chính

- Kết nối API Binance để bắt tín hiệu và đặt lệnh(chỉ khi chạy forward test)
- 2 chiến lược giao dịch nâng cao:
  - **Nadaraya UTBot** (Phiên bản tối ưu)
  - **Bollinger Band** (Kết hợp phân tích đa khung thời gian)
- Gửi thông báo tín hiệu real-time qua Discord và Telegram
- Quét tín hiệu 3 phút/lần


## ⚙️ Yêu cầu hệ thống

- Node.js v20.14.0 (Khuyến nghị dùng [nvm](https://github.com/nvm-sh/nvm))
- Tài khoản Binance đã kích hoạt API

## 🔧 Cài đặt

### 1. Cài đặt dependencies

```bash
npm install
```

### 2. Cấu hình môi trường

Tạo file `.env` cùng cấp với file `.env.example` sau đó copy nội dùng từ file `.env.example` vào file `.env` sau đó cập nhật những thông tin sau:

```bash
# CONNECTED APPS
# Không cần nhập nếu không cần gửi tin nhắn qua discord
DISCORD_WEBHOOK_URL= 
# Bắt buộc phải nhập 
BINANCE_API_KEY= 
# Bắt buộc phải nhập
BINANCE_API_SECRET=
# Không cần nhập nếu cần cần chạy forward test 
BINANCE_TEST_API_KEY= 
# Không cần nhập nếu cần cần chạy forward test 
BINANCE_TEST_API_SECRET= 
# Không cần nhập nếu không cần gửi tin nhắn qua telegram
TELEGRAM_BOT_TOKEN= 
# Không cần nhập nếu không cần gửi tin nhắn qua telegram
TELEGRAM_CHAT_ID= 

# CONFIG
# Set = false nếu không cần gửi tin nhắn qua telegram
IS_TELEGRAM_ENABLED=true
# Set = false nếu không cần gửi tin nhắn qua discord
IS_DISCORD_ENABLED=true
# Set = false nếu không cần gửi lưu tín hiệu vào folder logs
IS_LOG_ENABLED=true
SCAN_INTERVAL=180000 # 3 phút bot sẽ quét 1 lần

# ORDER SETTINGS(Setting đặt lệnh khi chạy forward test)
ORDER_LEVERAGE=15
ORDER_QUANTITY=10 # 10 USDT
TP_ROI_PERCENTAGE=15 # 15%
SL_ROI_PERCENTAGE=30 # 30%
```

## 🔑 Hướng dẫn lấy thông tin API

### Discord Webhook URL
- Vào Server Settings → Integrations → Webhooks
- Tạo webhook mới hoặc copy URL từ webhook có sẵn

### Binance API Keys
#### Mainnet(Tài khoản thực):

- Đăng nhập Binance → API Management
- Tạo API key mới

#### Testnet(Tài khoản demo):

- Truy cập Binance Testnet với tài khoản demo
- Try cập Features. Bên dưới chart coin tìm tab API Key và copy `API Key` và `API Secret`

### Telegram
- Tìm @BotFather trên Telegram → /newbot để tạo bot mới
- Lấy token từ @BotFather
- Tìm @getids bot để lấy Chat ID


## 🚦 Chạy ứng dụng

### Chế độ chính
```bash
npm start
```

### Chạy Backtest
```bash
npm run backtest
```

- Kết quả chi tiết: logs/backtest/backtest_results.json
- Báo cáo tổng hợp: logs/backtest/backtest_summary.json

### Chạy Forward test
```bash
npm run forwardtest
```

## ⚙️ Cấu hình chiến lược

Chỉnh sửa file `config.js` để tối ưu các thông số:

## 📌 Lưu ý quan trọng
- Luôn test bot với chế độ backtest và forward test trước khi dùng bot để trading thật
- Theo dõi logs ở terminal để phát hiện lỗi kịp thời

