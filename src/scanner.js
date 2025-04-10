const pLimit = require('p-limit')
const path = require('path')
const fs = require('fs')
const { getSymbols } = require('./symbolManager')
const { analyzeMarket } = require('./dataService')
const { runBacktest } = require('../backtest')
const { sendDiscordSignalMessage, sendDiscordMessage } = require('./discordService')
const { sendTelegramSignalMessage, sendTelegramMessage } = require('./telegramService')
const { STRATEGY_CONFIG } = require('./config')
const { ensureLogFolders, getLogFileName, getStrengthLabel } = require('./utils')

const sentSignalCache = new Set()

async function performScan() {
  console.log(`\n🔍 Bắt đầu quét lúc ${new Date().toLocaleTimeString()}`)

  try {
    const symbols = await getSymbols()
    const scanLimiter = pLimit(STRATEGY_CONFIG.concurrencyLimit)
    const scanPromises = symbols.map((symbol) => scanLimiter(() => analyzeMarket(symbol, 1000)))
    const results = await Promise.allSettled(scanPromises)

    let signalCount = 0
    const errors = []
    const allSignals = []

    for (const result of results) {
      if (result.status === 'rejected') {
        errors.push(result.reason)
        continue
      }

      const analysis = result.value
      if (!analysis) continue

      const symbol = analysis.symbol

      for (const [strategyName, action] of Object.entries(analysis.signals)) {
        if (action) {
          signalCount++
          const signalDetail = {
            symbol,
            strategy: strategyName.replace(/([A-Z])/g, ' $1').trim(),
            action: action?.action,
            price: analysis.price,
            strength: getStrengthLabel(action.isStrong),
            futuresDetails: analysis.futuresDetails[strategyName],
          }
          allSignals.push(signalDetail)
          console.log('Tín hiệu:', JSON.stringify(signalDetail, null, 2))
          const key = `${signalDetail.symbol}-${signalDetail.strategy}-${Math.floor(Date.now() / 60000)}`
          if (!sentSignalCache.has(key)) {
            sentSignalCache.add(key)
            await sendDiscordSignalMessage(signalDetail)
            await sendTelegramSignalMessage(signalDetail)
          }
        }
      }
    }

    if (process.env.LOG_TO_FILE === 'true') {
      ensureLogFolders()
      const signalFile = path.join('logs/signal', getLogFileName('signal'))
      fs.writeFileSync(signalFile, JSON.stringify(allSignals, null, 2))
      console.log(`📝 Đã ghi tín hiệu vào ${signalFile}`)
    }

    const summary = [
      `📊 Tổng kết quét:`,
      `- Tổng cặp: ${symbols.length}`,
      `- Tín hiệu: ${signalCount}`,
      `- Lỗi: ${errors.length}`,
      `- Thời gian quét: ${new Date().toLocaleString()}`,
    ].join('\n')

    console.log(summary)
    if (errors.length > 0) console.error('Chi tiết lỗi:', errors)
    await sendDiscordMessage(summary)
    await sendTelegramMessage(summary)
  } catch (error) {
    console.error('Lỗi quét tổng:', error)
  }
}

function startScanning() {
  performScan()
  const interval = setInterval(performScan, 1800000)
  process.on('SIGINT', () => {
    clearInterval(interval)
    console.log('🛑 Bot đã dừng')
    process.exit()
  })
}

module.exports = { startScanning }
