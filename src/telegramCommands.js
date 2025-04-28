const { sendTelegramMessage } = require('./telegramService')
const stateManager = require('./stateManager')
const { bot } = require('./telegramBot') // Giả sử đã setup bot Telegram

module.exports = (tester) => {
  bot.onText(/\/stop_order/, (msg) => {
    stateManager.state.orderPlacementEnabled = false
    stateManager.saveState()
    bot.sendMessage(msg.chat.id, '⏸ Đã dừng đặt lệnh')
  })

  bot.onText(/\/start_order/, (msg) => {
    stateManager.state.orderPlacementEnabled = true
    stateManager.saveState()
    bot.sendMessage(msg.chat.id, '▶️ Đã tiếp tục đặt lệnh')
  })

  bot.onText(/\/report/, async (msg) => {
    const report = await tester.generateReport()
    bot.sendMessage(msg.chat.id, report)
  })

  bot.onText(/\/help/, (msg) => {
    const helpText = `Các lệnh hỗ trợ:
/stop_order - Dừng đặt lệnh
/start_order - Tiếp tục đặt lệnh
/report - Xem báo cáo
/help - Trợ giúp`
    bot.sendMessage(msg.chat.id, helpText)
  })
}
