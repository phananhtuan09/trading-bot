const { TELEGRAM_CHAT_ID, IS_TELEGRAM_ENABLED } = require('./config')
const { telegramClient } = require('./clients')

// Tạo nội dung tin nhắn cho tín hiệu (sử dụng Markdown)
function createSignalMessage(signal) {
  const futures = signal.futuresDetails || {}
  const strengthLabel = signal.strength
  const message = `*${signal.symbol} - ${signal.strategy} Signal*
*Action:* ${signal.action}
*Strength:* ${strengthLabel}
*Price:* ${signal.price.toFixed(4)}
*Direction:* ${futures.direction || 'N/A'}
*Leverage:* ${futures.leverage ? futures.leverage + 'x' : 'N/A'}
*TP:* ${futures.tp ? futures.tp.toFixed(4) : 'N/A'}
*SL:* ${futures.sl ? futures.sl.toFixed(4) : 'N/A'}
`
  return message
}

// Gửi tín hiệu dưới dạng tin nhắn có format Markdown
async function sendTelegramSignalMessage(signal) {
  if (IS_TELEGRAM_ENABLED === 'true') {
    try {
      const message = createSignalMessage(signal)
      await telegramClient.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' })
    } catch (error) {
      console.error('Lỗi gửi Telegram signal:', error.message)
    }
  }
}

// Gửi tin nhắn text thông thường qua Telegram
async function sendTelegramMessage(message) {
  if (IS_TELEGRAM_ENABLED === 'true') {
    try {
      await telegramClient.sendMessage(TELEGRAM_CHAT_ID, message)
    } catch (error) {
      console.error('Lỗi gửi Telegram:', error.message)
    }
  }
}

// Kiểm tra kết nối tới Telegram bằng cách gọi API getMe()
async function checkTelegramConnection() {
  if (IS_TELEGRAM_ENABLED !== 'true') {
    return false
  }
  try {
    const botInfo = await telegramClient.getMe()
    if (botInfo && botInfo.username) {
      console.log(`✅ Đã kết nối Telegram với bot: @${botInfo.username}`)
      return true
    } else {
      throw new Error('Thông tin bot không hợp lệ')
    }
  } catch (error) {
    console.error('Lỗi kết nối Telegram:', error.message)
    return false
  }
}

module.exports = { sendTelegramSignalMessage, sendTelegramMessage, checkTelegramConnection }
