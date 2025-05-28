const { TELEGRAM } = require('./config')
const { telegramClient } = require('./clients')
const logger = require('./logger')

// Tạo nội dung tin nhắn cho tín hiệu (sử dụng Markdown)
function createSignalMessage(signal) {
  const futuresDetails = {
    strategies: '',
    strength: '',
  }
  Object.values(signal.futuresDetails).forEach((group) => {
    if (group.direction === signal.decision) {
      const strategies = group.contributors.sort().join(', ')
      futuresDetails.strategies = strategies
      futuresDetails.strength = group.strength
    }
  })

  const message = `*Tín hiệu:* ${signal.symbol}
*Hành động:* ${signal.decision || 'N/A'}
*Giá hiện tại:* ${signal.price || 'N/A'} 
*Độ mạnh:* ${futuresDetails.strength || 'N/A'}
*Chiến lược:* ${futuresDetails.strategies || 'N/A'}
*TP(ROI %):* ${signal.TP_ROI || 'N/A'}
*SL(ROI %):* ${signal.SL_ROI || 'N/A'}
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
      logger.error(`🚨 Lỗi gửi tín hiệu Telegram: ${error}`)
    }
  }
}

// Gửi tin nhắn text thông thường qua Telegram
async function sendTelegramMessage(message) {
  if (TELEGRAM.IS_ENABLED) {
    try {
      await telegramClient.sendMessage(TELEGRAM.CHAT_ID, message)
    } catch (error) {
      logger.error(`Lỗi gửi Telegram: ${error}`)
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
      logger.info(`✅ Đã kết nối Telegram với bot: @${botInfo.username}`)
      return true
    } else {
      throw new Error('Thông tin bot không hợp lệ')
    }
  } catch (error) {
    logger.error(`Lỗi kết nối Telegram: ${error}`)

    return false
  }
}

module.exports = { sendTelegramSignalMessage, sendTelegramMessage, checkTelegramConnection }
