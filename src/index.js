const { getSymbols } = require('./symbolManager')
const { startScanning } = require('./scanner')
const { checkDiscordConnection } = require('./discordService')
const { checkTelegramConnection } = require('./telegramService')
const { DISCORD, TELEGRAM } = require('./config')
const { binanceClient } = require('./clients')
const { log } = require('./utils')

async function checkBinanceConnection() {
  try {
    const time = await binanceClient.time()
    log('log', `✅ Binance: ${new Date(time).toLocaleString()}`)
    return true
  } catch (error) {
    log('error', '❌ Lỗi Binance:', error.message)
    return false
  }
}

async function initializeBot() {
  log('log', '🚀 Đang khởi động bot quét tín hiệu...')

  if (!(await checkBinanceConnection())) {
    log('error', '❌ Không thể kết nối Binance')
    process.exit(1)
  }

  const symbols = await getSymbols()
  if (symbols.length === 0) {
    log('error', '❌ Không có symbols hợp lệ')
    process.exit(1)
  }

  if (DISCORD.IS_ENABLED) {
    try {
      // Kết nối tới discord
      const isDiscordConnected = await checkDiscordConnection()
      if (!isDiscordConnected) {
        throw new Error('Kết nối Discord không thành công')
      }
      log('log', '✅ Đã kết nối Discord')
    } catch (error) {
      log('error', '❌ Lỗi Discord:', error.message)
      process.exit(1)
    }
  }

  if (TELEGRAM.IS_ENABLED) {
    try {
      // Kết nối tới telegram
      const isTelegramConnected = await checkTelegramConnection()
      if (!isTelegramConnected) {
        log('error', '❌ Kết nối Telegram không thành công')
      }
      log('log', '✅ Đã kết nối Telegram')
    } catch (error) {
      log('error', '❌ Lỗi Telegram:', error.message)
      process.exit(1)
    }
  }

  log('log', `📊 Bắt đầu theo dõi ${symbols.length} cặp:`)
  log('log', symbols.join(', '))

  startScanning()
}

initializeBot().catch((error) => {
  log('error', '💥 Lỗi khởi động:', error)
  process.exit(1)
})
