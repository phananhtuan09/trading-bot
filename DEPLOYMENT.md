# Hướng dẫn Deploy Trading Bot lên VPS

## Yêu cầu hệ thống

- **OS**: Ubuntu 18.04+ hoặc CentOS 7+
- **RAM**: Tối thiểu 1GB (khuyến nghị 2GB+)
- **CPU**: 1 core (khuyến nghị 2 cores+)
- **Storage**: 10GB+ free space
- **Network**: Kết nối internet ổn định

## Bước 1: Chuẩn bị VPS

### Cập nhật hệ thống

```bash
sudo apt update && sudo apt upgrade -y
```

### Cài đặt Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Cài đặt PM2

```bash
sudo npm install -g pm2
```

## Bước 2: Clone và Setup Project

### Clone repository

```bash
cd /home/anhtuan/source_codes/
git clone <your-repo-url> trading_bot
cd trading_bot
```

### Cài đặt dependencies

```bash
npm install
```

## Bước 3: Cấu hình Environment

### Tạo file .env

```bash
cp env.example .env
nano .env
```

### Cấu hình các thông tin cần thiết:

#### Binance API

- Tạo API key tại: https://www.binance.com/en/my/settings/api-management
- Cấp quyền: Spot & Margin Trading, Futures
- **Lưu ý**: Bật IP Restriction cho VPS IP

#### Discord Bot (tùy chọn)

- Tạo bot tại: https://discord.com/developers/applications
- Lấy Bot Token và Channel ID

#### Telegram Bot (tùy chọn)

- Tạo bot với @BotFather
- Lấy Bot Token và Chat ID

## Bước 4: Deploy

### Chạy script deployment

```bash
chmod +x deploy.sh
./deploy.sh
```

### Setup auto-start service

```bash
chmod +x scripts/setup-service.sh
./scripts/setup-service.sh
```

## Bước 5: Khởi động Bot

### Khởi động với PM2

```bash
./scripts/start.sh
```

### Hoặc sử dụng systemd service

```bash
sudo systemctl start trading-bot
```

## Quản lý Bot

### Các lệnh cơ bản

```bash
# Khởi động
./scripts/start.sh

# Dừng
./scripts/stop.sh

# Restart
./scripts/restart.sh

# Kiểm tra trạng thái
./scripts/status.sh

# Xem logs
pm2 logs trading-bot

# Monitor real-time
pm2 monit

# Dọn logs
./scripts/clean-logs.sh
```

### Systemd service commands

```bash
# Khởi động service
sudo systemctl start trading-bot

# Dừng service
sudo systemctl stop trading-bot

# Restart service
sudo systemctl restart trading-bot

# Kiểm tra trạng thái
sudo systemctl status trading-bot

# Xem logs
sudo journalctl -u trading-bot -f
```

## Monitoring và Logs

### PM2 Monitoring

```bash
# Dashboard
pm2 monit

# Status
pm2 status

# Logs
pm2 logs trading-bot --lines 100
```

### System Logs

```bash
# Application logs
tail -f logs/app.log

# Error logs
tail -f logs/error.log

# Combined logs
tail -f logs/combined.log
```

## Troubleshooting

### Bot không khởi động

1. Kiểm tra file .env có đúng format không
2. Kiểm tra API keys có hợp lệ không
3. Kiểm tra logs: `pm2 logs trading-bot`

### Lỗi kết nối Binance

1. Kiểm tra API keys
2. Kiểm tra IP restriction
3. Kiểm tra network connectivity

### Bot bị crash

1. Kiểm tra memory usage: `pm2 monit`
2. Kiểm tra logs để tìm lỗi
3. Restart bot: `pm2 restart trading-bot`

### Performance Issues

1. Tăng memory limit trong ecosystem.config.js
2. Giảm SCAN_INTERVAL trong .env
3. Giảm MAX_SYMBOLS trong config.js

## Security

### Firewall

```bash
# Mở port cần thiết
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### API Security

- Sử dụng API keys với IP restriction
- Không commit .env file
- Rotate API keys định kỳ

### File Permissions

```bash
# Bảo vệ file .env
chmod 600 .env

# Bảo vệ logs
chmod 755 logs/
```

## Backup

### Backup Configuration

```bash
# Backup .env
cp .env .env.backup

# Backup logs
tar -czf logs-backup-$(date +%Y%m%d).tar.gz logs/
```

### Auto Backup Script

Tạo cron job để backup hàng ngày:

```bash
# Thêm vào crontab
0 2 * * * /home/anhtuan/source_codes/trading_bot/scripts/backup.sh
```

## Updates

### Update Bot

```bash
# Pull latest code
git pull origin main

# Install new dependencies
npm install

# Restart bot
./scripts/restart.sh
```

### Update PM2

```bash
sudo npm install -g pm2@latest
pm2 update
```

## Performance Tuning

### Node.js Optimization

```bash
# Tăng memory limit
export NODE_OPTIONS="--max-old-space-size=2048"

# Hoặc trong ecosystem.config.js
env: {
  NODE_ENV: 'production',
  NODE_OPTIONS: '--max-old-space-size=2048'
}
```

### System Optimization

```bash
# Tăng file descriptors
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf
```

## Support

Nếu gặp vấn đề, kiểm tra:

1. Logs trong thư mục `logs/`
2. PM2 logs: `pm2 logs trading-bot`
3. System logs: `sudo journalctl -u trading-bot`
