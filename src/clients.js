const Binance = require('binance-api-node').default
const TelegramBot = require('node-telegram-bot-api')
const { BINANCE, TELEGRAM } = require('./config')

// Client cho môi trường thực
const binanceClient = Binance({
  apiKey: BINANCE.API_KEY,
  apiSecret: BINANCE.API_SECRET,
})

// Client cho testnet
const binanceTestClient = Binance({
  apiKey: BINANCE.TEST_API_KEY,
  apiSecret: BINANCE.TEST_API_SECRET,
  httpFutures: 'https://testnet.binancefuture.com', // URL cho futures testnet
})

// Khởi tạo Telegram bot (không bật chế độ polling vì chỉ gửi tin nhắn)
const telegramClient = !TELEGRAM.IS_ENABLED
  ? null
  : new TelegramBot(TELEGRAM.BOT_TOKEN, {
      polling: true,
      request: {
        agentOptions: {
          keepAlive: true,
          family: 4,
        },
      },
    })

module.exports = { binanceClient, telegramClient, binanceTestClient }
