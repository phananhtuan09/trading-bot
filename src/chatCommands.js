const stateManager = require('./stateManager')
const logger = require('./logger')
const { sendDiscordMessage } = require('./discordService')
const { sendTelegramMessage } = require('./telegramService')
const { telegramClient, discordClient } = require('./clients')
const { DISCORD, TELEGRAM } = require('./config')

// Hàm xử lý lệnh chung
const handleCommand = async (command, order, sendResponse, platform = 'unknown') => {
  try {
    switch (command.toLowerCase()) {
      case 'stop_order':
        stateManager.setStateAndSaveToFile({
          orderPlacementEnabled: false,
        })
        await sendResponse('⏸ Đã dừng đặt lệnh')
        break

      case 'start_order':
        stateManager.setStateAndSaveToFile({
          orderPlacementEnabled: true,
        })
        await sendResponse('▶️ Đã tiếp tục đặt lệnh')
        break

      case 'report':
        const report = await order.generateReport()
        await sendResponse(report)
        break

      case 'help':
        const helpText = `Các lệnh hỗ trợ:\n/stop_order - Dừng đặt lệnh\n/start_order - Tiếp tục đặt lệnh\n/report - Xem báo cáo\n/help - Trợ giúp`
        await sendResponse(helpText)
        break

      default:
        await sendResponse('❌ Lệnh không hợp lệ. Gõ /help để xem danh sách lệnh.')
    }
  } catch (error) {
    logger.error(`🚨 Lỗi xử lý lệnh ${command} trên ${platform}: ${error}`)
    await sendResponse('❌ Đã xảy ra lỗi khi xử lý lệnh.')
  }
}

// Khởi tạo lệnh cho Telegram
const setupTelegramCommands = (order) => {
  if (!TELEGRAM.IS_ENABLED || !telegramClient) {
    logger.warn('Telegram client is not initialized or disabled. Telegram commands will not work.')
    return
  }

  const commands = ['stop_order', 'start_order', 'report', 'help']

  commands.forEach((command) => {
    telegramClient.onText(new RegExp(`/${command}`), async (msg) => {
      await handleCommand(command, order, sendTelegramMessage, 'Telegram')
    })
  })

  logger.info('✅ Telegram commands initialized')
}

// Khởi tạo lệnh cho Discord
const setupDiscordCommands = (order) => {
  if (!DISCORD.IS_ENABLED || !discordClient) {
    logger.warn('Discord client is not initialized or disabled. Discord commands will not work.')
    return
  }

  discordClient.on('messageCreate', async (message) => {
    if (message.author.bot) return // Bỏ qua tin nhắn từ bot
    if (!message.content.startsWith('/')) return // Chỉ xử lý tin nhắn bắt đầu bằng "/"

    const args = message.content.slice(1).trim().split(/ +/)
    const command = args.shift().toLowerCase()
    await handleCommand(command, order, sendDiscordMessage, 'Discord')
  })

  logger.info('✅ Discord commands initialized')
}

module.exports = (order) => {
  setupTelegramCommands(order)
  setupDiscordCommands(order)
}
