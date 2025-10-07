const { discordClient } = require('./clients')
const { DISCORD } = require('./config')
const logger = require('./logger')

const username = 'Crypto Trading Bot'
const channelId = DISCORD.CHANNEL_ID

// Tạo Embed message cho tín hiệu giao dịch
function createSignalEmbed(signal) {
  return {
    title: `Tín hiệu: ${signal.symbol}`,
    description:
      `**Hành động:** ${signal.decision || 'N/A'}\n` +
      `**Giá hiện tại:** ${signal.price}\n` +
      `**Độ mạnh:** ${signal.strength || 'N/A'}/100\n` +
      `**Loại thị trường:** ${signal.marketType || 'N/A'}\n` +
      `**Lý do:** ${signal.reason || 'N/A'}\n` +
      `**TP(ROI %):** ${signal.TP_ROI || 'N/A'}\n` +
      `**SL(ROI %):** ${signal.SL_ROI || 'N/A'}`,
    timestamp: new Date().toISOString(),
    footer: {
      text: username,
    },
  }
}

// Gửi tín hiệu dưới dạng Embed message qua Discord client
async function sendDiscordSignalMessage(signal) {
  if (!DISCORD.IS_ENABLED || !discordClient) {
    logger.warn('Discord client is not initialized or disabled.')
    return
  }

  try {
    const channel = await discordClient.channels.fetch(channelId)
    if (!channel) {
      logger.error('🚨 Discord channel not found')
      return
    }

    const embed = createSignalEmbed(signal)
    await channel.send({ embeds: [embed] })
    logger.info('✅ Đã gửi tín hiệu Discord thành công!')
  } catch (error) {
    logger.error(`🚨 Lỗi gửi tín hiệu Discord: ${error}`)
  }
}

// Gửi tin nhắn text thông thường qua Discord client
async function sendDiscordMessage(message) {
  if (!DISCORD.IS_ENABLED || !discordClient) {
    return
  }

  try {
    const channel = await discordClient.channels.fetch(channelId)
    if (!channel) {
      logger.error('🚨 Discord channel not found')
      return
    }

    await channel.send(message)
    logger.info('✅ Đã gửi tin nhắn Discord thành công!')
  } catch (error) {
    logger.error(`🚨 Lỗi gửi tin nhắn Discord: ${error}`)
  }
}

// Kiểm tra kết nối Discord client
async function checkDiscordConnection() {
  if (!DISCORD.IS_ENABLED || !discordClient) {
    return false
  }

  try {
    await discordClient.user.setActivity('Crypto Trading Bot', { type: 'PLAYING' })
    logger.info('✅ Discord client connected successfully!')
    return true
  } catch (error) {
    logger.error(`🚨 Lỗi kết nối Discord client: ${error}`)
    return false
  }
}

module.exports = {
  sendDiscordSignalMessage,
  sendDiscordMessage,
  checkDiscordConnection,
}
