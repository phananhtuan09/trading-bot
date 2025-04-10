const Binance = require('binance-api-node').default
const TelegramBot = require('node-telegram-bot-api')
const {
  BINANCE_API_KEY,
  BINANCE_API_SECRET,
  IS_TELEGRAM_ENABLED,
  TELEGRAM_BOT_TOKEN,
} = require('./config')

const binanceClient = Binance({
  apiKey: BINANCE_API_KEY,
  apiSecret: BINANCE_API_SECRET,
})

// Khởi tạo Telegram bot (không bật chế độ polling vì chỉ gửi tin nhắn)
const telegramClient =
  IS_TELEGRAM_ENABLED !== 'true'
    ? null
    : new TelegramBot(TELEGRAM_BOT_TOKEN, {
        polling: false,
        request: {
          agentOptions: {
            keepAlive: true,
            family: 4,
          },
        },
      })

module.exports = { binanceClient, telegramClient }
