const { binanceClient } = require('../src/clients')
const { getHistoricalData, processSignals, filterSignals, calculateTPAndSL } = require('../src/dataService')
const TradingStrategies = require('../src/tradingStrategies')
const { RSI, BollingerBands, MACD, EMA } = require('technicalindicators')
const { STRATEGY_CONFIG, ORDER_SETTINGS } = require('../src/config')
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
  concurrency: 100,
}

async function fetchHistoricalData(symbol) {
  let allCandles = []
  const endTime = Date.now()
  const startTime = endTime - 10 * 24 * 60 * 60 * 1000 // Test trong 30 ngày

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
        // ichimoku: {
        //   highs: highs,
        //   lows: lows,
        //   closes: closes,
        // },
        // stochastic: {
        //   highs: highs,
        //   lows: lows,
        //   closes: closes,
        // },
        // adx: {
        //   highs: highs,
        //   lows: lows,
        //   closes: closes,
        // },
        // psar: {
        //   highs: highs,
        //   lows: lows,
        // },
      }

      const emaShort = EMA.calculate({ period: STRATEGY_CONFIG.emaPeriods.short, values: closes })
      const emaLong = EMA.calculate({ period: STRATEGY_CONFIG.emaPeriods.long, values: closes })
      const lastRSI = indicators.rsi.at(-1)

      // Thu thập tín hiệu
      const allStrategies = {
        // NadarayaUTBot: TradingStrategies.checkNadarayaUTBot(closes, volu
        // mes),
        BollingerBand: TradingStrategies.checkBollingerBand(indicators.bb, closes, emaShort, emaLong, lastRSI),
        RSI: TradingStrategies.checkRSI(indicators.rsi),
        MACD: TradingStrategies.checkMACD(indicators.macd),
        //  Combined: TradingStrategies.checkCombinedStrategy(indicators.bb, closes, indicators.rsi, indicators.macd),

        // VolumeSpike: TradingStrategies.checkVolumeSpike(closes, highs, lows, volumes),
        // skip
        // Ichimoku: TradingStrategies.checkIchimokuCloud(
        //   indicators.ichimoku.highs,
        //   indicators.ichimoku.lows,
        //   indicators.ichimoku.closes,
        // ),
        // skip
        // Stochastic: TradingStrategies.checkStochastic(
        //   indicators.stochastic.highs,
        //   indicators.stochastic.lows,
        //   indicators.stochastic.closes,
        // ),
        // skip
        // ADX: TradingStrategies.checkADX(
        //   indicators.adx.highs,
        //   indicators.adx.lows,
        //   indicators.adx.closes,
        //   volumes,
        //   indicators.rsi,
        // ),
        // skip
        //  ParabolicSAR: TradingStrategies.checkParabolicSAR(indicators.psar.highs, indicators.psar.lows, closes, volumes),
        //  Fibonacci: TradingStrategies.checkFibonacci(closes),
      }

      // Lọc tín hiệu
      const filteredStrategies = filterSignals(
        allStrategies,
        {
          highs,
          lows,
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
      const { TP_ROI, SL_ROI } = calculateTPAndSL(
        processed.decision,
        processed.strengthCount,
        currentPrice,
        highs,
        lows,
        closes,
      )

      if (TP_ROI < 5) continue

      const result = {
        symbol,
        date: new Date(chunk[i].time).toISOString(),
        action: processed.decision,
        entryPrice: currentPrice,
        strategies: [],
        TP_ROI,
        SL_ROI,
        initialMargin: ORDER_SETTINGS.QUANTITY,
        isHitTp: false,
        isHitSL: false,
        actual_ROI: 0,
        closePrice: currentPrice,
        closeMargin: 0,
        ROI_after1h: null,
        ROI_after4h: null,
        ROI_after8h: null,
        ROI_after12h: null,
        ROI_after24h: null,
        reasonClose: 'timeout24h',
        strength: processed.strengthCount,
        hitTime: null,
      }

      // Lấy danh sách chiến lược
      const contributingStrategies = []
      Object.values(processed.futuresDetails).forEach((group) => {
        if (group.direction === processed.decision) {
          contributingStrategies.push(...group.contributors)
        }
      })
      result.strategies = [...new Set(contributingStrategies)].sort().join('_')

      const initialMargin = ORDER_SETTINGS.QUANTITY // USD
      const leverage = ORDER_SETTINGS.LEVERAGE
      const entryPrice = currentPrice

      // Tính toán TP/SL và ROI
      const intervals = [1, 4, 8, 12, 24]
      for (let hours of intervals) {
        const targetIndex = i + hours
        if (targetIndex >= historicalData.length) break

        const targetPrice = historicalData[targetIndex].close
        const direction = processed.decision === 'Long' ? 1 : -1
        const roi = direction * ((targetPrice - entryPrice) / entryPrice) * 100

        result[`ROI_after${hours}h`] = roi
        // Tính toán TP/SL
        const tpPrice =
          processed.decision === 'Long' ? entryPrice * (1 + TP_ROI / 100) : entryPrice * (1 - TP_ROI / 100)
        const slPrice =
          processed.decision === 'Long' ? entryPrice * (1 + SL_ROI / 100) : entryPrice * (1 - SL_ROI / 100)

        const hitTP = processed.decision === 'Long' ? targetPrice >= tpPrice : targetPrice <= tpPrice
        const hitSL = processed.decision === 'Long' ? targetPrice <= slPrice : targetPrice >= slPrice

        if (hitTP) {
          result.reasonClose = 'hitTP'
          result.isHitTp = true
          result.closePrice = targetPrice
          result.hitTime = hours
          result.actual_ROI = TP_ROI
        } else if (hitSL) {
          result.reasonClose = 'hitSL'
          result.isHitSL = true
          result.closePrice = targetPrice
          result.hitTime = hours
          result.actual_ROI = SL_ROI
        }

        if (hours === 24 && !result.isHitTp && !result.isHitSL) {
          result.closePrice = targetPrice
          result.hitTime = 24
          result.reasonClose === 'timeout24h'
          result.actual_ROI = roi
        }

        if (result.isHitTp || result.isHitSL) break
      }

      // Tính closeMargin
      const quantity = (initialMargin * leverage) / entryPrice
      const pnl = (result.closePrice - entryPrice) * quantity * (processed.decision === 'Long' ? 1 : -1)
      result.closeMargin = initialMargin + pnl

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
