const { discordClient } = require('./clients')
const { getSymbols } = require('./symbolManager')
const { startScanning } = require('./scanner')
const { checkDiscordConnection } = require('./discordService')
const { checkTelegramConnection } = require('./telegramService')
const { IS_TELEGRAM_ENABLED, IS_DISCORD_ENABLED } = require('./config')

async function checkBinanceConnection() {
  const { binanceClient } = require('./clients')
  try {
    const time = await binanceClient.time()
    console.log(`✅ Binance: ${new Date(time).toLocaleString()}`)
    return true
  } catch (error) {
    console.error('❌ Lỗi Binance:', error.message)
    return false
  }
}

async function initializeBot() {
  console.log('🚀 Đang khởi động bot...')

  if (!(await checkBinanceConnection())) {
    console.error('❌ Không thể kết nối Binance')
    process.exit(1)
  }

  const symbols = await getSymbols()
  if (symbols.length === 0) {
    console.error('❌ Không có symbols hợp lệ')
    process.exit(1)
  }

  if (IS_DISCORD_ENABLED === 'true') {
    try {
      // Kết nối tới discord
      const isDiscordConnected = await checkDiscordConnection()
      if (!isDiscordConnected) {
        throw new Error('Kết nối Discord không thành công')
      }
      console.log('✅ Đã kết nối Discord')
    } catch (error) {
      console.error('❌ Lỗi Discord:', error.message)
      process.exit(1)
    }
  }

  if (IS_TELEGRAM_ENABLED === 'true') {
    try {
      // Kết nối tới telegram
      const isTelegramConnected = await checkTelegramConnection()
      if (!isTelegramConnected) {
        throw new Error('Kết nối Telegram không thành công')
      }
      console.log('✅ Đã kết nối Telegram')
    } catch (error) {
      console.error('❌ Lỗi Telegram:', error.message)
      process.exit(1)
    }
  }

  console.log(`📊 Bắt đầu theo dõi ${symbols.length} cặp:`)
  console.log(symbols.join(', '))

  startScanning()
}

initializeBot().catch((error) => {
  console.error('💥 Lỗi khởi động:', error)
  process.exit(1)
})
