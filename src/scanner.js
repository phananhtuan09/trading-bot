const pLimit = require('p-limit')
const path = require('path')
const fs = require('fs')
const { getSymbols } = require('./symbolManager')
const { analyzeMarket } = require('./dataService')
const { sendDiscordSignalMessage, sendDiscordMessage } = require('./discordService')
const { sendTelegramSignalMessage, sendTelegramMessage } = require('./telegramService')
const { STRATEGY_CONFIG, CONFIG } = require('./config')
const { ensureFoldersExist, getFileNameTimestamp } = require('./utils')

async function performScan() {
  // console.log(`\n🔍 Bắt đầu quét lúc ${new Date().toLocaleTimeString()}`)

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
      //   console.log('Tín hiệu:', JSON.stringify(signal, null, 2))
      allSignals.push(signal)
      await sendDiscordSignalMessage(signal)
      await sendTelegramSignalMessage(signal)
    }

    if (CONFIG.IS_LOG_ENABLED) {
      ensureFoldersExist(['logs/signals'])
      const signalFile = path.join('logs/signals', getFileNameTimestamp('signal'))
      fs.writeFileSync(signalFile, JSON.stringify(allSignals, null, 2))
      //  console.log(`📝 Đã ghi tín hiệu vào ${signalFile}`)
    }

    const summary = [
      `📊 Tổng kết quét:`,
      `- Tổng cặp: ${symbols.length}`,
      `- Tín hiệu: ${signalCount}`,
      `- Lỗi: ${errors.length}`,
      `- Thời gian quét: ${new Date().toLocaleString()}`,
    ].join('\n')

    // console.log(summary)
    if (errors.length > 0) {
      console.error('Chi tiết lỗi:', errors)
      return null
    }
    await sendDiscordMessage(summary)
    await sendTelegramMessage(summary)
    return allSignals
  } catch (error) {
    console.error('Lỗi quét tổng:', error)
    return null
  }
}

function startScanning() {
  performScan()
  const interval = setInterval(performScan, CONFIG.SCAN_INTERVAL)
  process.on('SIGINT', () => {
    clearInterval(interval)
    console.log('🛑 Bot đã dừng')
    process.exit()
  })
}

module.exports = { startScanning, performScan }
