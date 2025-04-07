const { EmbedBuilder } = require('discord.js')
const { discordClient, DISCORD_CHANNEL_ID } = require('./clients')
const { getStrengthLabel } = require('./utils')
const { IS_DISCORD_ENABLED } = require('./config')

// Tạo Embed message cho tín hiệu giao dịch
function createSignalEmbed(signal) {
  const futures = signal.futuresDetails || {}
  const strengthLabel = signal.strength

  return new EmbedBuilder()
    .setTitle(`${signal.symbol} - ${signal.strategy} Signal`)
    .setDescription(
      `**Action:** ${signal.action}\n` +
        `**Strength:** ${strengthLabel}\n` +
        `**Price:** ${signal.price.toFixed(4)}\n` +
        `**Direction:** ${futures.direction || 'N/A'}\n` +
        `**Leverage:** ${futures.leverage ? futures.leverage + 'x' : 'N/A'}\n` +
        `**TP:** ${futures.tp ? futures.tp.toFixed(4) : 'N/A'}\n` +
        `**SL:** ${futures.sl ? futures.sl.toFixed(4) : 'N/A'}`,
    )
    .setTimestamp()
    .setFooter({ text: 'Crypto Trading Bot' })
    .setColor(futures.isStrong ? 0xff0000 : 0xffff00)
}

// Gửi tín hiệu dưới dạng Embed message đến kênh Discord
async function sendDiscordSignalMessage(signal) {
  if (IS_DISCORD_ENABLED === 'true') {
    try {
      const channel = discordClient?.channels?.cache?.get(DISCORD_CHANNEL_ID)
      if (!channel) throw new Error('Channel không tồn tại')

      const embed = createSignalEmbed(signal)
      await channel.send({ embeds: [embed] })
    } catch (error) {
      console.error('Lỗi gửi Discord signal:', error.message)
    }
  }
}

// Gửi tin nhắn text thông thường đến kênh Discord
async function sendDiscordMessage(message) {
  if (IS_DISCORD_ENABLED === 'true') {
    try {
      const channel = discordClient?.channels?.cache?.get(DISCORD_CHANNEL_ID)
      if (!channel) throw new Error('Channel không tồn tại')

      await channel.send(message)
    } catch (error) {
      console.error('Lỗi gửi Discord:', error.message)
    }
  }
}

// Kiểm tra kết nối tới Discord có thành công hay không
async function checkDiscordConnection() {
  if (IS_DISCORD_ENABLED !== 'true') return false
  try {
    // Kiểm tra xem client đã đăng nhập và sẵn sàng hay chưa
    await discordClient.login(require('./config').DISCORD_TOKEN)
    if (discordClient && discordClient.user) {
      console.log(`✅ Đã kết nối Discord với bot: ${discordClient.user.tag}`)
      return true
    } else {
      throw new Error('Discord client không sẵn sàng')
    }
  } catch (error) {
    console.error('Lỗi kết nối Discord:', error.message)
    return false
  }
}

module.exports = { sendDiscordSignalMessage, sendDiscordMessage, checkDiscordConnection }
