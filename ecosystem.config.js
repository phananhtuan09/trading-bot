module.exports = {
  apps: [
    {
      name: 'trading-bot',
      script: 'src/order.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      // Restart khi có lỗi
      max_restarts: 10,
      min_uptime: '10s',
      // Kill timeout
      kill_timeout: 5000,
      // Wait ready
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
}
