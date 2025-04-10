// backtest.js
const { binanceClient } = require('./src/clients')
const { BollingerBands, MACD, EMA, RSI } = require('technicalindicators')
const { STRATEGY_CONFIG } = require('./src/config')
const fs = require('fs')
const path = require('path')
const TradingStrategies = require('./src/tradingStrategies')

const BACKTEST_SETTINGS = {
  symbol: 'BTCUSDT',
  interval: '1h',
  years: 1,
  resultFile: 'backtest_results.json',
}

async function fetchHistoricalData() {
  let allCandles = []
  const endTime = Date.now()
  const startTime = endTime - BACKTEST_SETTINGS.years * 365 * 24 * 60 * 60 * 1000

  let currentStart = startTime
  while (true) {
    const candles = await binanceClient.futuresCandles({
      symbol: BACKTEST_SETTINGS.symbol,
      interval: BACKTEST_SETTINGS.interval,
      startTime: currentStart,
      limit: 1000,
    })

    if (!candles.length) break
    allCandles = [...allCandles, ...candles]
    currentStart = candles[candles.length - 1].closeTime + 1

    if (currentStart > endTime) break
    await new Promise((resolve) => setTimeout(resolve, 500)) // Rate limit
  }

  return allCandles.map((c) => ({
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

async function runBacktest() {
  try {
    console.error('Bắt đầu test')
    const historicalData = await fetchHistoricalData()
    const results = []

    for (let i = 200; i < historicalData.length; i++) {
      // Đảm bảo đủ dữ liệu tính EMA
      const chunk = historicalData.slice(0, i + 1)
      const closes = chunk.map((c) => c.close)
      const highs = chunk.map((c) => c.high)
      const lows = chunk.map((c) => c.low)
      const volumes = chunk.map((c) => c.volume)

      // Tính chỉ báo
      const emaShort = EMA.calculate({
        period: STRATEGY_CONFIG.emaPeriods.short,
        values: closes,
      })
      const emaLong = EMA.calculate({
        period: STRATEGY_CONFIG.emaPeriods.long,
        values: closes,
      })
      const rsi = RSI.calculate({
        values: closes,
        period: STRATEGY_CONFIG.rsiPeriod,
      })

      // Phát hiện tín hiệu
      const signals = [
        TradingStrategies.checkBreakout(highs, lows, closes, volumes, emaShort, emaLong, rsi[rsi.length - 1]),
        TradingStrategies.checkBollingerBand(closes, emaShort, emaLong, rsi, volumes),
        TradingStrategies.checkMACD_RSI_Volume(closes, volumes, rsi),
      ]

      // Xử lý tín hiệu
      signals.forEach((signal, idx) => {
        if (!signal) return

        const result = {
          date: new Date(chunk[i].time).toISOString(),
          strategy: ['breakout', 'bollingerBand', 'macd_rsi_volume'][idx],
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

    // Lưu kết quả
    const outputPath = path.join(__dirname, 'test', BACKTEST_SETTINGS.resultFile)
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))
    console.log(`✅ Backtest hoàn thành. Kết quả lưu tại: ${outputPath}`)
  } catch (error) {
    console.error('❌ Lỗi backtest:', error)
  }
}

runBacktest()
