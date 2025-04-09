const axios = require('axios')
const { DISCORD_WEBHOOK_URL, IS_DISCORD_ENABLED } = require('./config')

const username = 'Tuan Trading Bot'

// Tạo Embed message cho tín hiệu giao dịch
function createSignalEmbed(signal) {
  const futures = signal.futuresDetails || {}
  return {
    title: `Tín hiệu: ${signal.symbol}`,
    description:
      `**Hành động:** ${futures.direction}\n` +
      `**Độ mạnh tín hiệu:** ${signal.strength}\n` +
      `**Giá hiện tại:** ${signal.price}\n` +
      `**Chiến lược:** ${signal.strategy}\n`,
    timestamp: new Date().toISOString(),
    footer: {
      text: 'Crypto Trading Bot',
    },
  }
}

// Gửi tín hiệu dưới dạng Embed message qua Webhook
async function sendDiscordSignalMessage(signal) {
  if (IS_DISCORD_ENABLED !== 'true') return

  try {
    const embed = createSignalEmbed(signal)

    const payload = {
      username,
      embeds: [embed],
    }

    await axios.post(DISCORD_WEBHOOK_URL, payload)
  } catch (error) {
    console.error('🚨 Lỗi gửi tín hiệu Discord:', error.message)
  }
}

// Gửi tin nhắn text thông thường qua Webhook
async function sendDiscordMessage(message) {
  if (IS_DISCORD_ENABLED !== 'true') return

  try {
    const payload = {
      username,
      content: message,
    }

    await axios.post(DISCORD_WEBHOOK_URL, payload)
  } catch (error) {
    console.error('🚨 Lỗi gửi tin nhắn Discord:', error.message)
  }
}

// Webhook không cần "check connection" như bot client nên ta có thể đơn giản hóa
async function checkDiscordConnection() {
  if (IS_DISCORD_ENABLED !== 'true') return false

  try {
    await axios.post(DISCORD_WEBHOOK_URL, {
      username,
      content: '🤖 Webhook Discord đã được kết nối thành công!',
    })

    console.log('✅ Đã kết nối Discord Webhook thành công!')
    return true
  } catch (error) {
    console.error('🚨 Lỗi kết nối Discord Webhook:', error.message)
    return false
  }
}

module.exports = {
  sendDiscordSignalMessage,
  sendDiscordMessage,
  checkDiscordConnection,
}
