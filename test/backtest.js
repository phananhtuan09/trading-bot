const { binanceClient } = require('../src/clients')
const { BollingerBands, RSI } = require('technicalindicators')
const { STRATEGY_CONFIG } = require('../src/config')
const fs = require('fs')
const path = require('path')
const TradingStrategies = require('../src/tradingStrategies')
const pLimit = require('p-limit')
const { getSymbols } = require('../src/symbolManager')
const { getFileNameTimestamp, ensureFoldersExist } = require('../src/utils')

const BACKTEST_SETTINGS = {
  symbols: [
    // Danh sách coin test
    'BTCUSDT',
    'ETHUSDT',
    'BNBUSDT',
    'SOLUSDT',
    'XRPUSDT',
    'ADAUSDT',
    'DOGEUSDT',
    'DOTUSDT',
    'AVAXUSDT',
    'LINKUSDT',
  ],
  interval: '1h',
  years: 1,
  resultFile: 'backtest_results',
  concurrency: 100, // Giới hạn request đồng thời
}

async function fetchHistoricalData(symbol) {
  let allCandles = []
  const endTime = Date.now()
  const startTime = endTime - 30 * 24 * 60 * 60 * 1000 // Test trong 30 ngày

  let currentStart = startTime
  while (true) {
    let attempts = 0
    let success = false
    let candles
    // Retry tối đa 3 lần
    while (attempts < 3 && !success) {
      try {
        candles = await binanceClient.futuresCandles({
          symbol: symbol,
          interval: BACKTEST_SETTINGS.interval,
          startTime: currentStart,
          limit: 1000,
        })
        success = true
      } catch (error) {
        attempts++
        console.log(`Retry ${attempts}/3 cho ${symbol}`)
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }
    }

    if (!success) throw new Error(`Fetch failed cho ${symbol} sau 3 lần thử`)

    if (!candles.length) break
    allCandles = [...allCandles, ...candles]
    currentStart = candles[candles.length - 1].closeTime + 1

    if (currentStart > endTime) break
    await new Promise((resolve) => setTimeout(resolve, 2000)) // Rate limit
  }

  return allCandles.map((c) => ({
    symbol, // Thêm symbol vào dữ liệu
    time: c.openTime,
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
    volume: parseFloat(c.volume),
  }))
}

function calculateProfit(entryPrice, exitPrice, action) {
  return action === 'BUY'
    ? (((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2)
    : (((entryPrice - exitPrice) / exitPrice) * 100).toFixed(2)
}

// Thêm trước khi chạy backtest
async function validateSymbols() {
  const exchangeInfo = await binanceClient.futuresExchangeInfo()
  const validSymbols = exchangeInfo.symbols.map((s) => s.symbol)

  return BACKTEST_SETTINGS.symbols.filter((symbol) => {
    if (!validSymbols.includes(symbol)) {
      console.warn(`⚠️ Loại bỏ symbol không hợp lệ: ${symbol}`)
      return false
    }
    return true
  })
}

async function processSymbol(symbol) {
  try {
    console.log(`🔄 Đang xử lý ${symbol}`)
    const historicalData = await fetchHistoricalData(symbol)
    // Thêm điều kiện kiểm tra
    if (historicalData.length < 100) {
      console.log(`⚠️ Không đủ dữ liệu cho ${symbol} (${historicalData.length} candles)`)
      return []
    }
    const results = []

    for (let i = 200; i < historicalData.length; i++) {
      // Đảm bảo đủ dữ liệu tính EMA
      const chunk = historicalData.slice(0, i + 1)
      const closes = chunk.map((c) => c.close)
      const highs = chunk.map((c) => c.high)
      const lows = chunk.map((c) => c.low)
      const volumes = chunk.map((c) => c.volume)

      // Tính RSI và kiểm tra độ dài
      const rsiValues = RSI.calculate({
        values: closes,
        period: STRATEGY_CONFIG.RSI_PERIOD,
      })

      const bb = BollingerBands.calculate({
        period: STRATEGY_CONFIG.BB_PERIOD,
        values: closes,
        stdDev: STRATEGY_CONFIG.STD_DEV,
      })

      // Tính độ rộng Bollinger Bands
      const bbWidth = bb.map((b) => (b.upper - b.lower) / b.middle)
      const recentBBWidth = bbWidth.slice(-STRATEGY_CONFIG.BREAKOUT_PERIOD)
      const avgBBWidth = recentBBWidth.reduce((a, b) => a + b, 0) / STRATEGY_CONFIG.BREAKOUT_PERIOD
      // Sửa điều kiện kiểm tra volatility
      const isVolatileMarket = avgBBWidth > STRATEGY_CONFIG.BB_SQUEEZE_THRESHOLD

      // Phát hiện tín hiệu
      const signals = [
        isVolatileMarket ? TradingStrategies.checkBollingerBand(closes, highs, lows, volumes, rsiValues, bb) : null,
        isVolatileMarket ? TradingStrategies.checkNadarayaUTBot(closes, volumes, rsiValues, highs) : null,
      ]

      signals.forEach((signal, index) => {
        if (!signal) return

        const result = {
          symbol, // Thêm symbol vào kết quả
          date: new Date(chunk[i].time).toISOString(),
          strategy: ['bollingerBand', 'nadarayaUTBot'][index],
          action: signal.action,
          price: chunk[i].close,
          after1h: {},
          after4h: {},
          after8h: {},
          after12h: {},
          after24h: {},
        }

        // Tính ROI cho các khung thời gian
        const intervals = [1, 4, 8, 12, 24]
        intervals.forEach((hours) => {
          const targetIndex = i + hours
          if (targetIndex >= historicalData.length) return

          const targetPrice = historicalData[targetIndex].close
          const entryPrice = result.price
          const exitPrice = targetPrice
          const initialMargin = 1 // USD
          const leverage = 10
          const direction = signal.action === 'BUY' ? 1 : -1

          const quantity = (initialMargin * leverage) / entryPrice
          const pnl = (exitPrice - entryPrice) * quantity * direction
          const roi = (pnl / initialMargin) * 100
          result[`after${hours}h`] = {
            price: targetPrice,
            profitPercent: calculateProfit(result.price, targetPrice, signal.action),
            roi: roi.toFixed(2), // ROI %
          }
        })

        results.push(result)
      })
    }
    return results
  } catch (error) {
    console.error(`❌ Lỗi với ${symbol}:`, error)
    return []
  }
}

async function runBacktest() {
  try {
    const symbols = await getSymbols()
    const limit = pLimit(BACKTEST_SETTINGS.concurrency)
    if (symbols.length === 0) {
      console.log('⚠️ Không có symbol nào để xử lý.')
      return
    }

    console.log('Xử lý tông cộng ' + symbols.length + ' symbol')

    const allResults = await Promise.all(symbols.map((symbol) => limit(() => processSymbol(symbol))))

    const mergedResults = allResults.flat()
    if (mergedResults.length === 0) {
      console.log('⚠️ Không có kết quả nào để ghi lại.')
      return
    }
    ensureFoldersExist(['logs/backtest'])
    const outputPath = path.join(
      __dirname,
      '..',
      'logs',
      'backtest',
      getFileNameTimestamp(BACKTEST_SETTINGS.resultFile),
    )
    fs.writeFileSync(outputPath, JSON.stringify(mergedResults, null, 2))
    console.log(`✅ Đã xử lý ${symbols.length} coins. Kết quả lưu tại: ${outputPath}`)
  } catch (error) {
    console.error('❌ Lỗi tổng:', error)
  }
}

runBacktest()
