const { sendDiscordSignalMessage, sendDiscordMessage } = require('./discordService')
const { sendTelegramSignalMessage, sendTelegramMessage } = require('./telegramService')

// Hàm gửi tín hiệu
async function sendSignalMessage(signal) {
  await Promise.all([sendTelegramSignalMessage(signal), sendDiscordSignalMessage(signal)])
}

// Hàm gửi tin nhắn thông thường
async function sendMessage(message) {
  await Promise.all([sendTelegramMessage(message), sendDiscordMessage(message)])
}

module.exports = {
  sendSignalMessage,
  sendMessage,
}
