const axios = require('axios')
const { DISCORD } = require('./config')

const username = 'Crypto Trading Bot'

// Tạo Embed message cho tín hiệu giao dịch
function createSignalEmbed(signal) {
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
  return {
    title: `Tín hiệu: ${signal.symbol}`,
    description:
      `**Hành động:** ${signal.decision || 'N/A'}\n` +
      `**Giá hiện tại:** ${signal.price}\n` +
      `**Độ mạnh:** ${futuresDetails.strength || 'N/A'}\n` +
      `**TP(ROI %):** ${signal.TP_ROI.toFixed(4) || 'N/A'}\n` +
      `**SL(ROI %):** ${signal.SL_ROI.toFixed(4) || 'N/A'}\n` +
      `**Chiến lược:** ${futuresDetails.strategies || 'N/A'}`,
    timestamp: new Date().toISOString(),
    footer: {
      text: username,
    },
  }
}

// Gửi tín hiệu dưới dạng Embed message qua Webhook
async function sendDiscordSignalMessage(signal) {
  if (DISCORD.IS_ENABLED) {
    try {
      const embed = createSignalEmbed(signal)

      const payload = {
        username,
        embeds: [embed],
      }

      await axios.post(DISCORD.WEBHOOK_URL, payload)
    } catch (error) {
      console.error('🚨 Lỗi gửi tín hiệu Discord:', error.message)
    }
  }
}

// Gửi tin nhắn text thông thường qua Webhook
async function sendDiscordMessage(message) {
  if (DISCORD.IS_ENABLED) {
    try {
      const payload = {
        username,
        content: message,
      }

      await axios.post(DISCORD.WEBHOOK_URL, payload)
    } catch (error) {
      console.error('🚨 Lỗi gửi tin nhắn Discord:', error.message)
    }
  }
}

// Webhook không cần "check connection" như bot client nên ta có thể đơn giản hóa
async function checkDiscordConnection() {
  if (!DISCORD.IS_ENABLED) return false

  try {
    await axios.post(DISCORD.WEBHOOK_URL, {
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
