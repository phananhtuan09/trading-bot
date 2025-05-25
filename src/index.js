const { getSymbols } = require('./symbolManager')
const { startScanning } = require('./scanner')
const { checkDiscordConnection } = require('./discordService')
const { checkTelegramConnection } = require('./telegramService')
const { DISCORD, TELEGRAM } = require('./config')
const { binanceTestClient: binanceClient } = require('../src/clients')
const logger = require('./logger')

async function checkBinanceConnection() {
  try {
    const time = await binanceClient.time()
    logger.info(`✅ Binance: ${new Date(time).toLocaleString()}`)
    return true
  } catch (error) {
    logger.error(`❌ Lỗi Binance: ${error.message}`)
    return false
  }
}

async function initializeBot() {
  logger.info('🚀 Đang khởi động bot quét tín hiệu...')

  if (!(await checkBinanceConnection())) {
    logger.error('❌ Không thể kết nối Binance')
    process.exit(1)
  }

  const symbols = await getSymbols()
  if (symbols.length === 0) {
    logger.error('❌ Không có symbols hợp lệ')
    process.exit(1)
  }

  if (DISCORD.IS_ENABLED) {
    try {
      // Kết nối tới discord
      const isDiscordConnected = await checkDiscordConnection()
      if (!isDiscordConnected) {
        throw new Error('Kết nối Discord không thành công')
      }
      logger.info('✅ Đã kết nối Discord')
    } catch (error) {
      logger.error(`❌ Lỗi Discord: ${error.message}`)
      process.exit(1)
    }
  }

  if (TELEGRAM.IS_ENABLED) {
    try {
      // Kết nối tới telegram
      const isTelegramConnected = await checkTelegramConnection()
      if (!isTelegramConnected) {
        logger.error('❌ Kết nối Telegram không thành công')
      }
      logger.info('✅ Đã kết nối Telegram')
    } catch (error) {
      logger.error(`❌ Lỗi Telegram: ${error.message}`)
      process.exit(1)
    }
  }

  logger.info(`📊 Bắt đầu theo dõi ${symbols.length} cặp:  ${symbols.join(', ')}`)
  startScanning()
}

initializeBot().catch((error) => {
  logger.error(`💥 Lỗi khởi động: ${error?.message}`)
  process.exit(1)
})
