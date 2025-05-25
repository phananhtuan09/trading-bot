const pLimit = require('p-limit')
const { getSymbols } = require('./symbolManager')
const { analyzeMarket } = require('./dataService')
const { sendDiscordSignalMessage, sendDiscordMessage } = require('./discordService')
const { sendTelegramSignalMessage, sendTelegramMessage } = require('./telegramService')
const { STRATEGY_CONFIG, CONFIG } = require('./config')
const logger = require('./logger')

async function performScan() {
  logger.info(`\n🔍 Bắt đầu quét lúc ${new Date().toLocaleTimeString()}`)

  try {
    const symbols = await getSymbols()
    const scanLimiter = pLimit(STRATEGY_CONFIG.CONCURRENCY_LIMIT)
    const scanPromises = symbols.map((symbol) => scanLimiter(() => analyzeMarket(symbol)))
    const results = await Promise.allSettled(scanPromises)

    let signalCount = 0
    const errors = []
    const allSignals = []

    for (const result of results) {
      if (result.status === 'rejected') {
        errors.push(result.reason)
        continue
      }

      const signal = result.value
      if (!signal) continue
      signalCount++
      logger.info(`Tín hiệu: ${signal.symbol} | ${signal.decision} | TP: ${signal.TP_ROI} | SL: ${signal.SL_ROI}`)
      allSignals.push(signal)
      await sendDiscordSignalMessage(signal)
      await sendTelegramSignalMessage(signal)
    }

    const summary = [
      `📊 Tổng kết quét:`,
      `- Tổng cặp: ${symbols.length}`,
      `- Tín hiệu: ${signalCount}`,
      `- Lỗi: ${errors.length}`,
      `- Thời gian quét: ${new Date().toLocaleString()}`,
    ].join('\n')

    logger.info(summary)
    if (errors.length > 0) {
      logger.error(`Chi tiết lỗi:', ${errors}`)
      return null
    }
    await sendDiscordMessage(summary)
    await sendTelegramMessage(summary)
    return allSignals
  } catch (error) {
    logger.error(`Lỗi quét tổng:', ${error}`)
    return null
  }
}

function startScanning() {
  performScan()
  const interval = setInterval(performScan, CONFIG.SCAN_INTERVAL)
  process.on('SIGINT', () => {
    clearInterval(interval)
    logger.info('🛑 Bot đã dừng')
    process.exit()
  })
}

module.exports = { startScanning, performScan }
