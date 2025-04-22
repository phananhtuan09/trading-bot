const { binanceClient } = require('../src/clients')
const { getHistoricalData, processSignals, filterSignals, calculateTPAndSL } = require('../src/dataService')
const TradingStrategies = require('../src/tradingStrategies')
const { RSI, BollingerBands, MACD } = require('technicalindicators')
const { STRATEGY_CONFIG } = require('../src/config')
const fs = require('fs')
const path = require('path')
const pLimit = require('p-limit')
const { getSymbols } = require('../src/symbolManager')
const { getFileNameTimestamp, ensureFoldersExist } = require('../src/utils')

const BACKTEST_SETTINGS = {
  symbols: [
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
  concurrency: 20,
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
        await new Promise((resolve) => setTimeout(resolve, 3000))
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

async function processSymbol(symbol) {
  try {
    console.log(`🔄 Đang xử lý ${symbol}`)
    const historicalData = await fetchHistoricalData(symbol)
    if (!historicalData || historicalData.length < 100) {
      console.log(`⚠️ Không đủ dữ liệu cho ${symbol} (${historicalData.length} candles)`)
      return []
    }
    const results = []

    for (let i = 200; i < historicalData.length; i++) {
      const chunk = historicalData.slice(0, i + 1)
      const closes = chunk.map((c) => c.close)
      const highs = chunk.map((c) => c.high)
      const lows = chunk.map((c) => c.low)
      const volumes = chunk.map((c) => c.volume)

      // Tính toán chỉ báo
      const indicators = {
        bb: BollingerBands.calculate({
          period: STRATEGY_CONFIG.BOLLINGER_BAND.PERIOD,
          values: closes,
          stdDev: STRATEGY_CONFIG.BOLLINGER_BAND.STD_DEV,
        }),
        rsi: RSI.calculate({
          values: closes,
          period: STRATEGY_CONFIG.RSI.PERIOD,
        }),
        macd: MACD.calculate({
          values: closes,
          fastPeriod: STRATEGY_CONFIG.MACD.FAST_PERIOD,
          slowPeriod: STRATEGY_CONFIG.MACD.SLOW_PERIOD,
          signalPeriod: STRATEGY_CONFIG.MACD.SIGNAL_PERIOD,
        }),
        ichimoku: {
          highs: highs,
          lows: lows,
          closes: closes,
        },
        stochastic: {
          highs: highs,
          lows: lows,
          closes: closes,
        },
        adx: {
          highs: highs,
          lows: lows,
          closes: closes,
        },
        psar: {
          highs: highs,
          lows: lows,
        },
      }

      // Thu thập tín hiệu
      const allStrategies = {
        NadarayaUTBot: TradingStrategies.checkNadarayaUTBot(closes),
        BollingerBand: TradingStrategies.checkBollingerBand(indicators.bb, closes),
        RSI: TradingStrategies.checkRSI(indicators.rsi),
        MACD: TradingStrategies.checkMACD(indicators.macd),
        VolumeSpike: TradingStrategies.checkVolumeSpike(closes, volumes),
        Ichimoku: TradingStrategies.checkIchimokuCloud(
          indicators.ichimoku.highs,
          indicators.ichimoku.lows,
          indicators.ichimoku.closes,
        ),
        Stochastic: TradingStrategies.checkStochastic(
          indicators.stochastic.highs,
          indicators.stochastic.lows,
          indicators.stochastic.closes,
        ),
        ADX: TradingStrategies.checkADX(indicators.adx.highs, indicators.adx.lows, indicators.adx.closes),
        ParabolicSAR: TradingStrategies.checkParabolicSAR(indicators.psar.highs, indicators.psar.lows),
        Fibonacci: TradingStrategies.checkFibonacci(closes),
      }

      // Lọc tín hiệu
      const filteredStrategies = filterSignals(
        allStrategies,
        {
          closes,
          volumes,
        },
        indicators,
      )
      if (filteredStrategies === null) continue

      // Xử lý tín hiệu và tạo output
      const processed = processSignals(filteredStrategies)
      if (processed === null) continue

      const currentPrice = closes.at(-1)
      const { TP, SL, TP_ROI, SL_ROI } = calculateTPAndSL(
        processed.decision,
        processed.strengthCount,
        currentPrice,
        highs,
        lows,
        closes,
      )

      const result = {
        symbol,
        date: new Date(chunk[i].time).toISOString(), // Cần điều chỉnh để lấy thời gian từ dữ liệu lịch sử nếu có
        action: processed.decision,
        price: currentPrice,
        strategy: 'all',
        TP_ROI,
        SL_ROI,
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
        const direction = processed.decision === 'Long' ? 1 : -1

        const quantity = (initialMargin * leverage) / entryPrice
        const pnl = (exitPrice - entryPrice) * quantity * direction
        const roi = (pnl / initialMargin) * 100
        result[`after${hours}h`] = {
          price: targetPrice,
          profitPercent: calculateProfit(result.price, targetPrice, processed.decision),
          roi: roi.toFixed(2),
        }
      })

      results.push(result)
    }
    return results
  } catch (error) {
    console.error(`❌ Lỗi với ${symbol}:`, error)
    return []
  }
}

function calculateProfit(entryPrice, exitPrice, decision) {
  return decision === 'Long'
    ? (((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2)
    : (((entryPrice - exitPrice) / exitPrice) * 100).toFixed(2)
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
