const Binance = require('binance-api-node').default
const TelegramBot = require('node-telegram-bot-api')
const { BINANCE, TELEGRAM, DISCORD } = require('./config')
const { Client, GatewayIntentBits } = require('discord.js')
const logger = require('./logger')

// Client cho môi trường thực
const binanceClient = Binance({
  apiKey: BINANCE.API_KEY,
  apiSecret: BINANCE.API_SECRET,
})

// Client cho testnet
const binanceTestClient = Binance({
  apiKey: BINANCE.TEST_API_KEY,
  apiSecret: BINANCE.TEST_API_SECRET,
  httpFutures: 'https://testnet.binancefuture.com', // URL cho futures testnet
})

// Khởi tạo Telegram bot
const telegramClient = !TELEGRAM.IS_ENABLED
  ? null
  : new TelegramBot(TELEGRAM.BOT_TOKEN, {
      polling: true,
      request: {
        agentOptions: {
          keepAlive: true,
          family: 4,
        },
      },
    })

let discordClient = null

// Khởi tạo Discord client
const initDiscordClient = () => {
  if (!DISCORD.IS_ENABLED) {
    logger.warn('Discord is not enabled. Discord client will not be initialized.')
    return null
  }

  if (!DISCORD.BOT_TOKEN) {
    logger.error('Discord bot token is not provided. Discord client will not be initialized.')
    throw new Error('Discord bot token is required')
  }

  if (discordClient) {
    return discordClient
  }

  discordClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  })

  // Chờ client sẵn sàng
  return new Promise((resolve, reject) => {
    discordClient.once('ready', () => {
      logger.info(`Logged in as ${discordClient.user.tag}`)
      resolve(discordClient)
    })

    discordClient.login(DISCORD.BOT_TOKEN).catch((error) => {
      logger.error(`Failed to login to Discord: ${error}`)
      reject(error)
    })
  })
}

if (DISCORD.IS_ENABLED && DISCORD.BOT_TOKEN) {
  initDiscordClient()
}

module.exports = { binanceClient, telegramClient, binanceTestClient, discordClient }
