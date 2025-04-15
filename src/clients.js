const Binance = require('binance-api-node').default
const TelegramBot = require('node-telegram-bot-api')
const { BINANCE, TELEGRAM } = require('./config')

const binanceClient = Binance({
  apiKey: BINANCE.API_KEY,
  apiSecret: BINANCE.API_SECRET,
})

// Khởi tạo Telegram bot (không bật chế độ polling vì chỉ gửi tin nhắn)
const telegramClient = !TELEGRAM.IS_ENABLED
  ? null
  : new TelegramBot(TELEGRAM.BOT_TOKEN, {
      polling: false,
      request: {
        agentOptions: {
          keepAlive: true,
          family: 4,
        },
      },
    })

module.exports = { binanceClient, telegramClient }
