require('dotenv').config()

const STRATEGY_CONFIG = {
  INTERVAL: '1h', // Khoảng thời gian của mỗi nến (candle), ví dụ '1h' là 1 giờ.

  QUOTE_ASSET: 'USDT', // Loại tiền tệ cơ sở được giao dịch.

  MAX_SYMBOLS: 500, // Số lượng symbol tối đa được xử lý cùng lúc.

  EXCHANGE_INFO_CACHE_TIME: 3600000, // Thời gian cache thông tin sàn (1 giờ).

  CONCURRENCY_LIMIT: 20, // Giới hạn xử lý song song.

  // Bollinger Bands
  BOLLINGER_BAND: {
    PERIOD: 20, // Số nến để tính toán Bollinger Bands.
    STD_DEV: 2, // Độ lệch chuẩn cho Bollinger Bands.
    MIN_BANDWIDTH_PCT: 2, // Độ rộng dải tối thiểu 2%
    BREAK_THRESHOLD_PCT: 0.5, // Ngưỡng vượt band 1%
    VOLUME_MA_PERIOD: 20, // Lọc volume trung bình 20 phiên
    ADX_THRESHOLD: 25, // Ngưỡng ADX tối thiểu
    VOLUME_MA_THRESHOLD: 100000, // Thêm ngưỡng volume trung bình
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
    HISTOGRAM_STRENGTH_RATIO: 1.1,
  },

  emaPeriods: {
    short: 20, // EMA ngắn: sử dụng 20 giá trị cuối.
    long: 50, // EMA dài: sử dụng 50 giá trị cuối.
  },

  // Strength Levels
  STRENGTH_LEVELS: {
    STRONG: 7,
    MEDIUM: 5,
    WEAK: 3,
  },

  STOCHASTIC: {
    period: 14,
    signalPeriod: 3,
  },
  ADX: {
    period: 14,
    strongTrendThreshold: 25, // Tăng từ 20 lên 25
  },

  ICHIMOKU: {
    conversionPeriod: 9,
    basePeriod: 26,
    spanPeriod: 52,
  },
  PSAR: {
    step: 0.02,
    max: 0.2,
  },
  MOMENTUM: {
    period: 14,
    threshold: 100,
    CROSSOVER_ZERO: true,
  },

  FILTER: {
    VOLUME_THRESHOLD: 0.8,
    RSI_STRENGTH_BUFFER: 5,
    MACD_STRENGTH_RATIO: 0.5,
    TREND_MA_PERIOD: 200,
    ENABLE_VOLUME_FILTER: true,
    ENABLE_TREND_FILTER: true,
    MIN_TRADE_VOLUME: 700000, // 1 triệu USDT
    STRATEGY_WEIGHTS: {
      MACD: 2,
      RSI: 2,
      Ichimoku: 2,
      PSAR: 2,
      Momentum: 1,
      BollingerBands: 2,
      ADX: 2,
      Stochastic: 1,
      SMA: 2,
    },
    MIN_CONFIDENCE_SCORE: 8,
    MULTI_TIMEFRAME_EMA: {
      SHORT: 50,
      LONG: 200,
    },
  },
  ATR: {
    period: 14,
  },
  VOLATILITY: {
    ATR_PERIOD: 14,
    STD_DEV_PERIOD: 50,
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
    MAX_ORDERS_PER_DAY: Number(process.env.MAX_ORDERS_PER_DAY),
    ORDER_LIMIT_PER_SCAN: Number(process.env.ORDER_LIMIT_PER_SCAN),
  },
}
