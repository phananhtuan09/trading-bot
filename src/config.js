require('dotenv').config()

const STRATEGY_CONFIG = {
  // Khoảng thời gian của mỗi candle, ví dụ '1h' tức là 1 giờ.
  interval: '1h',

  // Cấu hình cho đường EMA: chu kỳ ngắn và chu kỳ dài.
  emaPeriods: {
    short: 20, // EMA ngắn: sử dụng 20 giá trị cuối.
    long: 50, // EMA dài: sử dụng 50 giá trị cuối.
  },

  // Cấu hình cho chỉ báo RSI, sử dụng 14 giá trị cuối.
  rsiPeriod: 14,

  // Cấu hình cho Bollinger Bands: sử dụng 20 giá trị cuối.
  bbPeriod: 20,

  // Số lượng candle trong quá khứ được sử dụng để xác định mức breakout.
  breakoutPeriod: 14,

  // Xác định loại tiền được giao dịch, ở đây là USDT.
  quoteAsset: 'USDT',

  // Số lượng symbol tối đa cần xử lý.
  maxSymbols: 500,

  // Thời gian (ms) lưu cache thông tin giao dịch trên sàn (exchange info).
  exchangeInfoCacheTime: 3600000, // 1 giờ

  // Giới hạn số lượng song song khi xử lý nhiều symbol cùng lúc.
  concurrencyLimit: 20,

  // Cấu hình risk management
  riskManagement: {
    volumeMultiplier: 1.5, // Hệ số nhân cho volume để xác định tín hiệu breakout.
  },

  // Tham số độ lệch chuẩn cho Bollinger Bands.
  stdDev: 1.5,

  // Số lượng candle được sử dụng để tính trung bình volume.
  volumeLookback: 10,

  // Cấu hình ngưỡng RSI để xác định vùng quá mua hoặc quá bán.
  rsiThresholds: {
    overbought: 65, // RSI trên 65 là vùng quá mua.
    oversold: 35, // RSI dưới 35 là vùng quá bán.
  },
  bbSqueezeThreshold: 0.1, // Ngưỡng độ hẹp Bollinger Band
}

module.exports = {
  DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
  BINANCE_API_KEY: process.env.BINANCE_API_KEY,
  BINANCE_API_SECRET: process.env.BINANCE_API_SECRET,
  IS_TELEGRAM_ENABLED: process.env.IS_TELEGRAM_ENABLED,
  IS_DISCORD_ENABLED: process.env.IS_DISCORD_ENABLED,
  STRATEGY_CONFIG,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
}
