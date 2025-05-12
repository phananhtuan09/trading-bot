const { binanceClient } = require('./clients')
const TradingStrategies = require('./tradingStrategies')
const { RSI, BollingerBands, MACD, ADX, EMA, Stochastic, IchimokuCloud, PSAR } = require('technicalindicators')
const { STRATEGY_CONFIG } = require('./config')
const { log } = require('./utils')

async function getHistoricalData(symbol, interval = STRATEGY_CONFIG.INTERVAL, limit = 200) {
  const BATCH_SIZE = 100
  let allCandles = [] // Sẽ lưu trữ nến từ cũ nhất đến mới nhất

  try {
    let requestsNeeded = Math.ceil(limit / BATCH_SIZE)
    let currentBatchEndTime

    for (let i = 0; i < requestsNeeded; i++) {
      const numCandlesToFetchThisIteration = Math.min(BATCH_SIZE, limit - allCandles.length)

      if (numCandlesToFetchThisIteration <= 0) {
        break // Đã lấy đủ hoặc vượt limit
      }

      const params = {
        symbol: symbol,
        interval,
        limit: numCandlesToFetchThisIteration,
      }

      if (currentBatchEndTime) {
        params.endTime = currentBatchEndTime
      }
      const newCandlesBatch = await binanceClient.futuresCandles(params)

      if (!newCandlesBatch || newCandlesBatch.length === 0) {
        break // Dừng nếu không có thêm dữ liệu
      }

      if (newCandlesBatch[0] && typeof newCandlesBatch[0].openTime === 'number' && newCandlesBatch[0].openTime > 0) {
        currentBatchEndTime = newCandlesBatch[0].openTime
      } else {
        allCandles = [...newCandlesBatch, ...allCandles]
        break
      }

      allCandles = [...newCandlesBatch, ...allCandles]

      if (newCandlesBatch.length < numCandlesToFetchThisIteration) {
        break
      }

      if (allCandles.length >= limit) {
        break // Đã lấy đủ số nến yêu cầu
      }

      if (i < requestsNeeded - 1 && allCandles.length < limit) {
        const delay = 500 + Math.random() * 200
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    const finalCandles = allCandles.length > limit ? allCandles.slice(allCandles.length - limit) : allCandles

    if (finalCandles.length === 0 && limit > 0) {
      log('warn', `[${symbol}-${interval}] Không có nến nào được lấy cho yêu cầu ${limit} nến.`)
      return null
    }
    if (finalCandles.length < limit && limit > 0 && requestsNeeded > 0 && allCandles.length > 0) {
      log('warn', `[${symbol}-${interval}] Chỉ lấy được ${finalCandles.length} trong số ${limit} nến yêu cầu.`)
    }

    return {
      symbol,
      closes: finalCandles.map((c) => parseFloat(c.close)),
      highs: finalCandles.map((c) => parseFloat(c.high)),
      lows: finalCandles.map((c) => parseFloat(c.low)),
      volumes: finalCandles.map((c) => parseFloat(c.volume)),
    }
  } catch (error) {
    log(
      'error',
      `Lỗi xử lý dữ liệu futures cho ${symbol} (${interval}): ${error.message}`,
      error.code ? `(Code: ${error.code})` : '',
      error.stack ? error.stack : '',
    )
    return null
  }
}

function calculateMomentum(closes, period = 10) {
  return closes.map((close, index) => {
    if (index < period) return null
    return close - closes[index - period]
  })
}

function processSignals(signals) {
  const signalGroups = {
    BUY: { strategies: [], count: 0 },
    SELL: { strategies: [], count: 0 },
  }
  for (const [strategy, signal] of Object.entries(signals)) {
    if (signal === 'BUY') {
      signalGroups.BUY.strategies.push(strategy)
      signalGroups.BUY.count++
    } else if (signal === 'SELL') {
      signalGroups.SELL.strategies.push(strategy)
      signalGroups.SELL.count++
    }
  }
  const futuresDetails = {}
  for (const [action, group] of Object.entries(signalGroups)) {
    if (group.count > 0) {
      const key = group.strategies.join('_') || action
      futuresDetails[key] = {
        direction: action === 'BUY' ? 'Long' : 'Short',
        strength: `${group.count}/${Object.keys(signals).length}`,
        contributors: group.strategies,
      }
    }
  }

  // Quyết định cuối cùng
  let decision = 'Wait' // Nếu tín hiệu buy và sell bằn nhau
  let strengthCount = 0
  if (signalGroups.BUY.count > signalGroups.SELL.count) {
    strengthCount = signalGroups.BUY.count
    decision = 'Long'
  } else if (signalGroups.SELL.count > signalGroups.BUY.count) {
    strengthCount = signalGroups.SELL.count
    decision = 'Short'
  }

  if (decision === 'Wait') {
    return null
  }

  return { decision, futuresDetails, strengthCount }
}

function filterSignals(strategies, data, indicators, multiTimeframe) {
  const volumeMA = data.volumes.length >= 20 ? data.volumes.slice(-20).reduce((a, b) => a + b, 0) / 20 : 0
  const currentATR = indicators.atr
  const dailyVolume = data.volumes.slice(-24).reduce((a, b) => a + b, 0)
  if (dailyVolume < STRATEGY_CONFIG.FILTER.MIN_TRADE_VOLUME) {
    return null
  }

  const ema200 = EMA.calculate({
    period: STRATEGY_CONFIG.FILTER.TREND_MA_PERIOD,
    values: data.closes,
  })
  const currentEma200 = ema200[ema200.length - 1]
  const isPriceAboveEMA200 = data.closes.at(-1) > currentEma200
  const isPriceBelowEMA200 = data.closes.at(-1) < currentEma200

  // Chỉ cho phép tín hiệu MUA khi giá trên EMA200 và tín hiệu BÁN khi giá dưới EMA200
  const validSignals = Object.entries(strategies).reduce((acc, [strategy, signal]) => {
    if (signal === 'BUY' && isPriceAboveEMA200) {
      acc[strategy] = signal
    } else if (signal === 'SELL' && isPriceBelowEMA200) {
      acc[strategy] = signal
    }
    return acc
  }, {})

  let confidenceScore = Object.entries(validSignals).reduce((score, [strategy, signal]) => {
    return score + (signal ? STRATEGY_CONFIG.FILTER.STRATEGY_WEIGHTS[strategy] || 1 : 0)
  }, 0)

  // const multiTimeframeConfirm = Object.values(multiTimeframe).filter(
  //   (tf) => tf.ema && data.closes.at(-1) > tf.ema.at(-1),
  // ).length
  // confidenceScore += multiTimeframeConfirm * 2

  if (confidenceScore < STRATEGY_CONFIG.FILTER.MIN_CONFIDENCE_SCORE) {
    return null
  }

  if (currentATR > data.closes.at(-1) * 0.05) {
    return null
  }

  // Nới lỏng kết hợp RSI và MACD: chỉ yêu cầu MACD không ngược chiều
  if (validSignals.RSI) {
    if (strategies.MACD && strategies.MACD !== validSignals.RSI) {
      delete validSignals.RSI
    }
  }

  if (validSignals.BollingerBands && volumeMA < STRATEGY_CONFIG.BOLLINGER_BAND.VOLUME_MA_THRESHOLD) {
    delete validSignals.BollingerBands
  }

  return Object.keys(validSignals).length > 0 ? validSignals : null
}

// Format tín hiệu thay null -> ""
function formatSignals(signals) {
  return Object.fromEntries(Object.entries(signals).map(([k, v]) => [k, v || '']))
}

// Hàm tính TP và SL mới dựa trên ATR
function calculateTPAndSL(decision, currentPrice, indicators) {
  const { atr, volatility } = indicators
  const baseTP = decision === 'Long' ? currentPrice + 3 * atr : currentPrice - 3 * atr

  const baseSL = decision === 'Long' ? currentPrice - 2 * atr : currentPrice + 2 * atr

  const TP_ROI = (((baseTP - currentPrice) / currentPrice) * 100).toFixed(2)
  let SL_ROI = TP_ROI * 2
  if (SL_ROI > 20) {
    SL_ROI = 20
  }

  // Điều chỉnh theo độ biến động
  const volatilityAdjustment = 1 + volatility / 100
  return {
    TP: baseTP * volatilityAdjustment,
    SL: baseSL / volatilityAdjustment,
    TP_ROI,
    SL_ROI: -SL_ROI,
    // SL_ROI: (((baseSL - currentPrice) / currentPrice) * 100).toFixed(2),
  }
}

async function analyzeTimeframe(symbol, interval) {
  const data = await getHistoricalData(symbol, interval)
  return {
    ema: EMA.calculate({
      period: STRATEGY_CONFIG.FILTER.MULTI_TIMEFRAME_EMA.LONG,
      values: data.closes,
    }),
    atr: calculateATR(data.highs, data.lows, data.closes),
  }
}

function calculateATR(highs, lows, closes, period = STRATEGY_CONFIG.ATR.period) {
  const tr = []
  for (let i = 1; i < highs.length; i++) {
    const highLow = highs[i] - lows[i]
    const highPrevClose = Math.abs(highs[i] - closes[i - 1])
    const lowPrevClose = Math.abs(lows[i] - closes[i - 1])
    tr.push(Math.max(highLow, highPrevClose, lowPrevClose))
  }
  // Sử dụng phương pháp Wilder thay vì SMA để tính ATR chuẩn hơn
  let atr = tr[0]
  for (let i = 1; i < tr.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period
  }
  return atr
}

async function analyzeMarket(symbol) {
  try {
    const data = await getHistoricalData(symbol)
    if (!data || data.closes.length < 200) return null // Tăng yêu cầu tối thiểu lên 200 để đảm bảo EMA200

    const atrValues = calculateATR(data.highs, data.lows, data.closes)
    const currentATR = atrValues || 0
    const currentPrice = data.closes.at(-1)
    const volatility = currentATR ? (currentATR / currentPrice) * 100 : 0

    const indicators = {
      bb: BollingerBands.calculate({
        period: STRATEGY_CONFIG.BOLLINGER_BAND.PERIOD,
        values: data.closes,
        stdDev: STRATEGY_CONFIG.BOLLINGER_BAND.STD_DEV,
      }),
      rsi: RSI.calculate({
        values: data.closes,
        period: STRATEGY_CONFIG.RSI.PERIOD,
      }),
      macd: MACD.calculate({
        values: data.closes,
        fastPeriod: STRATEGY_CONFIG.MACD.FAST_PERIOD,
        slowPeriod: STRATEGY_CONFIG.MACD.SLOW_PERIOD,
        signalPeriod: STRATEGY_CONFIG.MACD.SIGNAL_PERIOD,
      }),
      stochastic: Stochastic.calculate({
        high: data.highs,
        low: data.lows,
        close: data.closes,
        period: STRATEGY_CONFIG.STOCHASTIC.period,
        signalPeriod: STRATEGY_CONFIG.STOCHASTIC.signalPeriod,
      }),
      adx: ADX.calculate({
        high: data.highs,
        low: data.lows,
        close: data.closes,
        period: STRATEGY_CONFIG.ADX.period,
      }),
      ichimoku: IchimokuCloud.calculate({
        high: data.highs,
        low: data.lows,
        conversionPeriod: STRATEGY_CONFIG.ICHIMOKU.conversionPeriod,
        basePeriod: STRATEGY_CONFIG.ICHIMOKU.basePeriod,
        spanPeriod: STRATEGY_CONFIG.ICHIMOKU.spanPeriod,
      }),
      psar: PSAR.calculate({
        high: data.highs,
        low: data.lows,
        step: STRATEGY_CONFIG.PSAR.step,
        max: STRATEGY_CONFIG.PSAR.max,
      }),
      momentum: calculateMomentum(data.closes, STRATEGY_CONFIG.MOMENTUM.period),
      atr: currentATR,
      volatility: volatility,
    }

    const emaShort = EMA.calculate({ period: STRATEGY_CONFIG.emaPeriods.short, values: data.closes })
    const emaLong = EMA.calculate({ period: STRATEGY_CONFIG.emaPeriods.long, values: data.closes })

    // Thêm phân tích đa khung thời gian
    const multiTimeframeAnalysis = {}
    const timeframes = ['1h', '4h', '1d']

    for (const tf of timeframes) {
      multiTimeframeAnalysis[tf] = await analyzeTimeframe(symbol, tf)
      const delay = 700 + Math.random() * 300 // Random delay 500-800ms
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    const allStrategies = {
      RSI: TradingStrategies.checkRSI(indicators.rsi),
      MACD: TradingStrategies.checkMACD(indicators.macd),
      SMA: TradingStrategies.checkSMA(emaShort, emaLong),
      Stochastic: TradingStrategies.checkStochastic(indicators.stochastic),
      BollingerBands: TradingStrategies.checkBollingerBands(indicators.bb, data.closes),
      ADX: TradingStrategies.checkADX(indicators.adx),
      Ichimoku: TradingStrategies.checkIchimoku(indicators.ichimoku, data.closes.at(-1), data.highs, data.lows),
      PSAR: TradingStrategies.checkPSAR(indicators.psar, data.closes.at(-1)),
      Momentum: TradingStrategies.checkMomentum(indicators.momentum),
    }

    // Lọc tín hiệu
    const filteredStrategies = filterSignals(allStrategies, data, indicators, multiTimeframeAnalysis)

    if (filteredStrategies === null) return null

    // Xử lý tín hiệu và tạo output
    const processed = processSignals(filteredStrategies)
    if (processed === null) return null

    const { TP_ROI, SL_ROI } = calculateTPAndSL(processed.decision, currentPrice, indicators)

    if (TP_ROI < 5) return null

    return {
      symbol,
      signals: formatSignals(filteredStrategies),
      decision: processed.decision,
      futuresDetails: processed.futuresDetails,
      price: currentPrice,
      TP_ROI,
      SL_ROI,
    }
  } catch (error) {
    log('error', `Error analyzing ${symbol}:`, error)
    return null
  }
}

module.exports = {
  getHistoricalData,
  analyzeMarket,
  processSignals,
  filterSignals,
  calculateTPAndSL,
  calculateATR,
  calculateMomentum,
  analyzeTimeframe,
}
