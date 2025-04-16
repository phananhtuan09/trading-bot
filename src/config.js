require('dotenv').config()

const STRATEGY_CONFIG = {
  INTERVAL: '1h', // Khoảng thời gian của mỗi nến (candle), ví dụ '1h' là 1 giờ.

  EMA_PERIODS: {
    SHORT: 20, // EMA ngắn: sử dụng 20 giá trị gần nhất.
    LONG: 50, // EMA dài: sử dụng 50 giá trị gần nhất.
  },

  RSI_PERIOD: 14, // Cấu hình cho chỉ báo RSI: sử dụng 14 giá trị gần nhất.

  BB_PERIOD: 14, // Cấu hình cho Bollinger Bands: sử dụng 14 giá trị gần nhất.

  BREAKOUT_PERIOD: 14, // Số lượng nến được dùng để xác định breakout.

  QUOTE_ASSET: 'USDT', // Loại tiền tệ cơ sở được giao dịch.

  MAX_SYMBOLS: 500, // Số lượng symbol tối đa được xử lý cùng lúc.

  EXCHANGE_INFO_CACHE_TIME: 3600000, // Thời gian cache thông tin sàn (1 giờ).

  CONCURRENCY_LIMIT: 20, // Giới hạn xử lý song song.

  STD_DEV: 1.8, // Độ lệch chuẩn cho Bollinger Bands.

  VOLUME_LOOKBACK: 14, // Số nến để tính trung bình khối lượng.

  RSI_THRESHOLDS: {
    OVERBOUGHT: 60, // RSI > 60: quá mua.
    OVERSOLD: 40, // RSI < 40: quá bán.
  },

  BB_SQUEEZE_THRESHOLD: 0.1, // Ngưỡng siết BB.

  VOLUME_THRESHOLD: 1.2, // Ngưỡng volume vượt trung bình.

  NADARAYA_WINDOW: 40, // Số điểm dùng cho hồi quy Nadaraya-Watson.
  NADARAYA_BANDWIDTH: 7, // Bandwidth cho hàm Gaussian.
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
    SL_ROI_PERCENTAGE_LONG: Number(process.env.SL_ROI_PERCENTAGE),
  },
}
