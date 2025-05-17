require('dotenv').config()

const STRATEGY_CONFIG = {
  INTERVAL: '1h', // Khoảng thời gian của mỗi nến (ví dụ: '1h' là 1 giờ)
  QUOTE_ASSET: 'USDT', // Tiền tệ cơ sở để giao dịch
  MAX_SYMBOLS: 500, // Số lượng symbol tối đa xử lý đồng thời
  EXCHANGE_INFO_CACHE_TIME: 3600000, // Thời gian cache thông tin sàn (1 giờ)
  CONCURRENCY_LIMIT: 20, // Giới hạn xử lý song song

  MAX_CANDLES_HOLD: 96, // Số nến tối đa để giữ lại trong bộ nhớ

  BOLLINGER_BAND: {
    PERIOD: 20, // Số nến để tính Bollinger Bands
    STD_DEV: 2, // Độ lệch chuẩn cho Bollinger Bands
    MIN_BANDWIDTH_PCT: 2, // Độ rộng dải tối thiểu (2%)
    BREAK_THRESHOLD_PCT: 0.5, // Ngưỡng vượt dải (0.5%)
    VOLUME_MA_PERIOD: 20, // Số nến để tính trung bình volume
    VOLUME_MA_THRESHOLD: 100000, // Ngưỡng trung bình volume
  },

  RSI: {
    PERIOD: 14, // Số nến để tính RSI
    OVERSOLD: 30, // Ngưỡng RSI quá bán
    OVERBOUGHT: 70, // Ngưỡng RSI quá mua
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

  STOCHASTIC: {
    PERIOD: 14, // Số nến để tính Stochastic
    SIGNAL_PERIOD: 3, // Số nến tín hiệu
  },

  ADX: {
    PERIOD: 14, // Số nến để tính ADX
    STRONG_TREND_THRESHOLD: 25, // Ngưỡng xu hướng mạnh
  },

  ICHIMOKU: {
    CONVERSION_PERIOD: 9, // Số nến cho Tenkan-sen
    BASE_PERIOD: 26, // Số nến cho Kijun-sen
    SPAN_PERIOD: 52, // Số nến cho Senkou Span
  },

  PSAR: {
    STEP: 0.02, // Bước tăng của PSAR
    MAX: 0.2, // Giá trị tối đa của PSAR
  },

  MOMENTUM: {
    PERIOD: 14, // Số nến để tính Momentum
    CROSSOVER_ZERO: true, // Kích hoạt kiểm tra giao cắt zero
  },

  FILTER: {
    TREND_MA_PERIOD: 200, // Số nến để tính xu hướng MA
    MIN_TRADE_VOLUME: 700000, // Khối lượng giao dịch tối thiểu (USDT)
    STRATEGY_WEIGHTS: {
      MACD: 2, // Trọng số MACD
      RSI: 2, // Trọng số RSI
      ICHIMOKU: 2, // Trọng số Ichimoku
      PSAR: 2, // Trọng số PSAR
      MOMENTUM: 1, // Trọng số Momentum
      BOLLINGER_BANDS: 2, // Trọng số Bollinger Bands
      ADX: 2, // Trọng số ADX
      STOCHASTIC: 1, // Trọng số Stochastic
      SMA: 2, // Trọng số SMA
    },
    MIN_CONFIDENCE_SCORE: 8, // Điểm tin cậy tối thiểu
    MULTI_TIMEFRAME_EMA: {
      SHORT: 50, // EMA ngắn cho đa khung thời gian
      LONG: 200, // EMA dài cho đa khung thời gian
    },
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
    WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL, // URL webhook Discord
    IS_ENABLED: process.env.IS_DISCORD_ENABLED === 'true', // Bật/tắt Discord
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
