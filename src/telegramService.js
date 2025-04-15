const { TELEGRAM } = require('./config')
const { telegramClient } = require('./clients')

// Tạo nội dung tin nhắn cho tín hiệu (sử dụng Markdown)
function createSignalMessage(signal) {
  const futures = signal.futuresDetails || {}
  const message = `*Tín hiệu:* ${signal.symbol}
*Hành động:* ${futures.direction || 'N/A'}
*Giá hiện tại:* ${signal.price}
*Chiến lược:* ${signal.strategy}
`
  return message
}

// Gửi tín hiệu dưới dạng tin nhắn có format Markdown
async function sendTelegramSignalMessage(signal) {
  if (TELEGRAM.IS_ENABLED) {
    try {
      const message = createSignalMessage(signal)
      await telegramClient.sendMessage(TELEGRAM.CHAT_ID, message, { parse_mode: 'Markdown' })
    } catch (error) {
      console.error('Lỗi gửi Telegram signal:', error.message)
    }
  }
}

// Gửi tin nhắn text thông thường qua Telegram
async function sendTelegramMessage(message) {
  if (TELEGRAM.IS_ENABLED) {
    try {
      await telegramClient.sendMessage(TELEGRAM.CHAT_ID, message)
    } catch (error) {
      console.error('Lỗi gửi Telegram:', error.message)
    }
  }
}

// Kiểm tra kết nối tới Telegram bằng cách gọi API getMe()
async function checkTelegramConnection() {
  if (!TELEGRAM.IS_ENABLED) {
    return false
  }
  try {
    const botInfo = await telegramClient.getMe()
    if (botInfo?.username) {
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
