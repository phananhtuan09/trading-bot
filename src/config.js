require('dotenv').config()

const STRATEGY_CONFIG = {
  INTERVAL: '1h', // Khoảng thời gian của mỗi nến (candle), ví dụ '1h' là 1 giờ.

  QUOTE_ASSET: 'USDT', // Loại tiền tệ cơ sở được giao dịch.

  MAX_SYMBOLS: 500, // Số lượng symbol tối đa được xử lý cùng lúc.

  EXCHANGE_INFO_CACHE_TIME: 3600000, // Thời gian cache thông tin sàn (1 giờ).

  CONCURRENCY_LIMIT: 20, // Giới hạn xử lý song song.

  // Nadaraya-Watson
  NADARAYA: {
    WINDOW: 50, // Số điểm dùng cho hồi quy Nadaraya-Watson.
    BANDWIDTH: 10, // Bandwidth cho hàm Gaussian.
  },

  // Bollinger Bands
  BOLLINGER_BAND: {
    PERIOD: 20, // Số nến để tính toán Bollinger Bands.
    STD_DEV: 2, // Độ lệch chuẩn cho Bollinger Bands.
    MIN_BANDWIDTH_PCT: 5, // Độ rộng dải tối thiểu 5%
    BREAK_THRESHOLD_PCT: 1, // Ngưỡng vượt band 1%
    VOLUME_MA_PERIOD: 20, // Lọc volume trung bình 20 phiên
    ADX_THRESHOLD: 25, // Ngưỡng ADX tối thiểu
  },

  // RSI
  RSI: {
    PERIOD: 14, // Số nến để tính toán RSI.
    OVERSOLD: 30, // Ngưỡng RSI quá bán.
    OVERBOUGHT: 70, // Ngưỡng RSI quá mua.
  },

  // MACD
  MACD: {
    FAST_PERIOD: 12, // Số nến nhanh cho MACD.
    SLOW_PERIOD: 26, // Số nến chậm cho MACD.
    SIGNAL_PERIOD: 9, // Số nến tín hiệu cho MACD.
  },

  // Volume
  VOLUME: {
    PERIOD: 20, // Số nến để tính toán khối lượng trung bình.
    THRESHOLD: 2, // Ngưỡng khối lượng vượt trung bình.
  },

  // Strength Levels
  STRENGTH_LEVELS: {
    STRONG: 6,
    MEDIUM: 5,
    WEAK: 1,
  },

  ICHIMOKU: {
    conversionPeriod: 9,
    basePeriod: 26,
    spanPeriod: 52,
    displacement: 26,
  },
  STOCHASTIC: {
    period: 14,
    signalPeriod: 3,
  },
  ADX: {
    period: 14,
    strongTrendThreshold: 25,
  },
  PARABOLIC_SAR: {
    step: 0.02,
    max: 0.2,
  },
  FIBONACCI: {
    retracementLevels: [0.236, 0.382, 0.5, 0.618, 0.786],
    lookbackPeriod: 50,
  },
  FILTER: {
    VOLUME_THRESHOLD: 0.8,
    RSI_STRENGTH_BUFFER: 5,
    MACD_STRENGTH_RATIO: 0.5,
    TREND_MA_PERIOD: 200,
    ENABLE_VOLUME_FILTER: true,
    ENABLE_TREND_FILTER: true,
  },
  ATR: {
    period: 14,
  },
}

module.exports = {
  STRATEGY_CONFIG,
  BINANCE: {
    API_KEY: process.env.BINANCE_API_KEY,
    API_SECRET: process.env.BINANCE_API_SECRET,
    TEST_API_KEY: process.env.BINANCE_TEST_API_KEY,
    TEST_API_SECRET: process.env.BINANCE_TEST_API_SECRET,
  },
  DISCORD: {
    WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
    IS_ENABLED: process.env.IS_DISCORD_ENABLED === 'true',
  },
  TELEGRAM: {
    BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    IS_ENABLED: process.env.IS_TELEGRAM_ENABLED === 'true',
  },
  CONFIG: {
    IS_LOG_ENABLED: process.env.IS_LOG_ENABLED === 'true',
    SCAN_INTERVAL: Number(process.env.SCAN_INTERVAL),
  },
  ORDER_SETTINGS: {
    LEVERAGE: Number(process.env.ORDER_LEVERAGE),
    QUANTITY: Number(process.env.ORDER_QUANTITY),
    TP_ROI_PERCENTAGE: Number(process.env.TP_ROI_PERCENTAGE),
    SL_ROI_PERCENTAGE: Number(process.env.SL_ROI_PERCENTAGE),
  },
}
