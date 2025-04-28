const stateManager = require('./stateManager')
const { telegramClient } = require('./clients') // Giả sử đã setup bot Telegram

module.exports = (tester) => {
  telegramClient.onText(/\/stop_order/, (msg) => {
    stateManager.state.orderPlacementEnabled = false
    stateManager.saveState()
    telegramClient.sendMessage(msg.chat.id, '⏸ Đã dừng đặt lệnh')
  })

  telegramClient.onText(/\/start_order/, (msg) => {
    stateManager.state.orderPlacementEnabled = true
    stateManager.saveState()
    telegramClient.sendMessage(msg.chat.id, '▶️ Đã tiếp tục đặt lệnh')
  })

  telegramClient.onText(/\/report/, async (msg) => {
    const report = await tester.generateReport()
    telegramClient.sendMessage(msg.chat.id, report)
  })

  telegramClient.onText(/\/help/, (msg) => {
    const helpText = `Các lệnh hỗ trợ:
/stop_order - Dừng đặt lệnh
/start_order - Tiếp tục đặt lệnh
/report - Xem báo cáo
/help - Trợ giúp`
    telegramClient.sendMessage(msg.chat.id, helpText)
  })
}
