require('dotenv').config()

const STRATEGY_CONFIG = {
  INTERVAL: '1h', // Khoảng thời gian của mỗi nến (ví dụ: '1h' là 1 giờ)
  QUOTE_ASSET: 'USDT', // Tiền tệ cơ sở để giao dịch
  MAX_SYMBOLS: 500, // Số lượng symbol tối đa xử lý đồng thời
  EXCHANGE_INFO_CACHE_TIME: 3600000, // Thời gian cache thông tin sàn (1 giờ)
  CONCURRENCY_LIMIT: 20, // Giới hạn xử lý song song

  MAX_CANDLES_HOLD: 96, // Số nến tối đa để giữ lại trong bộ nhớ

  // Chỉ giữ lại các chỉ báo cần thiết cho chiến lược mới
  BOLLINGER_BAND: {
    PERIOD: 20, // Số nến để tính Bollinger Bands
    STD_DEV: 2, // Độ lệch chuẩn cho Bollinger Bands
  },

  RSI: {
    PERIOD: 14, // Số nến để tính RSI
  },

  MACD: {
    FAST_PERIOD: 12, // Số nến nhanh cho MACD
    SLOW_PERIOD: 26, // Số nến chậm cho MACD
    SIGNAL_PERIOD: 9, // Số nến tín hiệu cho MACD
  },

  EMA_PERIODS: {
    SHORT: 20, // EMA ngắn (20 nến)
    LONG: 50, // EMA dài (50 nến)
  },

  ADX: {
    PERIOD: 14, // Số nến để tính ADX
  },

  FILTER: {
    TREND_MA_PERIOD: 200, // Số nến để tính xu hướng MA
    MIN_TRADE_VOLUME: 1000000, // Khối lượng giao dịch tối thiểu (USDT) - tăng lên
    MIN_CONFIDENCE_SCORE: 60, // Điểm tin cậy tối thiểu - tăng lên để giảm tín hiệu
  },

  ATR: {
    PERIOD: 14, // Số nến để tính ATR
  },
}

module.exports = {
  STRATEGY_CONFIG: STRATEGY_CONFIG,
  BINANCE: {
    API_KEY: process.env.BINANCE_API_KEY, // Khóa API Binance
    API_SECRET: process.env.BINANCE_API_SECRET, // Bí mật API Binance
    TEST_API_KEY: process.env.BINANCE_TEST_API_KEY, // Khóa API testnet Binance
    TEST_API_SECRET: process.env.BINANCE_TEST_API_SECRET, // Bí mật API testnet Binance
  },
  DISCORD: {
    BOT_TOKEN: process.env.DISCORD_BOT_TOKEN, // Token bot Discord
    IS_ENABLED: process.env.IS_DISCORD_ENABLED === 'true', // Bật/tắt Discord
    CHANNEL_ID: process.env.DISCORD_CHANNEL_ID, // ID kênh Discord
  },
  TELEGRAM: {
    BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN, // Token bot Telegram
    CHAT_ID: process.env.TELEGRAM_CHAT_ID, // ID chat Telegram
    IS_ENABLED: process.env.IS_TELEGRAM_ENABLED === 'true', // Bật/tắt Telegram
  },
  CONFIG: {
    IS_LOG_ENABLED: process.env.IS_LOG_ENABLED === 'true', // Bật/tắt ghi log
    SCAN_INTERVAL: Number(process.env.SCAN_INTERVAL), // Khoảng thời gian quét
  },
  ORDER_SETTINGS: {
    LEVERAGE: Number(process.env.ORDER_LEVERAGE), // Đòn bẩy giao dịch
    QUANTITY: Number(process.env.ORDER_QUANTITY), // Khối lượng giao dịch
    MAX_ORDERS_PER_DAY: Number(process.env.MAX_ORDERS_PER_DAY), // Số lệnh tối đa mỗi ngày
    ORDER_LIMIT_PER_SCAN: Number(process.env.ORDER_LIMIT_PER_SCAN), // Giới hạn lệnh mỗi lần quét
  },
}
