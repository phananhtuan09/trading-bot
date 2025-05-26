const stateManager = require('./stateManager')
const { telegramClient, discordClient } = require('./clients')
const { TELEGRAM, DISCORD } = require('./config')
const logger = require('./logger')

// Hàm xử lý lệnh chung
const handleCommand = async (command, args, sendResponse, platform = 'unknown') => {
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
        const report = await tester.generateReport()
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
    logger.error(`🚨 Lỗi xử lý lệnh ${command} trên ${platform}: ${error.message}`)
    await sendResponse('❌ Đã xảy ra lỗi khi xử lý lệnh.')
  }
}

// Khởi tạo lệnh cho Telegram
const setupTelegramCommands = (tester) => {
  if (!TELEGRAM.IS_ENABLED || !telegramClient) {
    logger.warn('Telegram client is not initialized or disabled. Telegram commands will not work.')
    return
  }

  telegramClient.onText(/\/stop_order/, (msg) =>
    handleCommand('stop_order', [], (text) => telegramClient.sendMessage(msg.chat.id, text), 'Telegram'),
  )

  telegramClient.onText(/\/start_order/, (msg) =>
    handleCommand('start_order', [], (text) => telegramClient.sendMessage(msg.chat.id, text), 'Telegram'),
  )

  telegramClient.onText(/\/report/, (msg) =>
    handleCommand('report', [], (text) => telegramClient.sendMessage(msg.chat.id, text), 'Telegram'),
  )

  telegramClient.onText(/\/help/, (msg) =>
    handleCommand('help', [], (text) => telegramClient.sendMessage(msg.chat.id, text), 'Telegram'),
  )

  logger.info('✅ Telegram commands initialized')
}

// Khởi tạo lệnh cho Discord
const setupDiscordCommands = (tester) => {
  if (!DISCORD.IS_ENABLED || !discordClient) {
    logger.warn('Discord client is not initialized or disabled. Discord commands will not work.')
    return
  }

  discordClient.on('messageCreate', async (message) => {
    if (message.author.bot) return // Bỏ qua tin nhắn từ bot
    if (!message.content.startsWith('/')) return // Chỉ xử lý tin nhắn bắt đầu bằng "/"

    const args = message.content.slice(1).trim().split(/ +/)
    const command = args.shift().toLowerCase()

    await handleCommand(command, args, (text) => message.channel.send(text), 'Discord')
  })

  logger.info('✅ Discord commands initialized')
}

module.exports = (tester) => {
  setupTelegramCommands(tester)
  setupDiscordCommands(tester)
}
