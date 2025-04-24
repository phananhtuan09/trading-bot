const { binanceClient } = require('./clients')
const TradingStrategies = require('./tradingStrategies')
const { RSI, BollingerBands, MACD } = require('technicalindicators')
const { STRATEGY_CONFIG } = require('./config')

async function getHistoricalData(symbol) {
  try {
    const candles = await binanceClient.futuresCandles({
      symbol: symbol,
      interval: STRATEGY_CONFIG.INTERVAL,
      limit: 100,
    })

    return {
      symbol,
      closes: candles.map((c) => parseFloat(c.close)),
      highs: candles.map((c) => parseFloat(c.high)),
      lows: candles.map((c) => parseFloat(c.low)),
      volumes: candles.map((c) => parseFloat(c.volume)),
    }
  } catch (error) {
    console.error(`Lỗi dữ liệu futures cho ${symbol}:`, error.message)
    return null
  }
}

// Hàm xử lý chính
function processSignals(signals) {
  const signalGroups = {
    BUY: { strategies: [], count: 0 },
    SELL: { strategies: [], count: 0 },
  }

  // Nhóm các tín hiệu
  for (const [strategy, signal] of Object.entries(signals)) {
    if (signal === 'BUY') {
      signalGroups.BUY.strategies.push(strategy)
      signalGroups.BUY.count++
    } else if (signal === 'SELL') {
      signalGroups.SELL.strategies.push(strategy)
      signalGroups.SELL.count++
    }
  }

  // Tạo futuresDetails
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

// Thêm các hàm utility
function calculateMA(values, period) {
  if (values.length < period) return []
  const ma = []
  for (let i = period - 1; i < values.length; i++) {
    const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
    ma.push(sum / period)
  }
  return ma
}

// Hàm tính ATR đơn giản
function calculateATR(highs, lows, closes, period = 14) {
  const tr = []
  for (let i = 1; i < highs.length; i++) {
    const highLow = highs[i] - lows[i]
    const highPrevClose = Math.abs(highs[i] - closes[i - 1])
    const lowPrevClose = Math.abs(lows[i] - closes[i - 1])
    tr.push(Math.max(highLow, highPrevClose, lowPrevClose))
  }
  const atr = []
  for (let i = period - 1; i < tr.length; i++) {
    const avg = tr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
    atr.push(avg)
  }
  return atr
}

function calculateAverageMACDDiff(macdData) {
  const diffs = macdData.map((d) => Math.abs(d.MACD - d.signal))
  return diffs.reduce((a, b) => a + b, 0) / diffs.length
}

function filterSignals(strategies, data, indicators) {
  const filtered = { ...strategies }
  const { FILTER } = STRATEGY_CONFIG

  // 1. Lọc volume
  if (FILTER.ENABLE_VOLUME_FILTER) {
    const recentVolumes = data.volumes.slice(-STRATEGY_CONFIG.VOLUME.PERIOD)
    const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length
    const currentVolume = data.volumes.at(-1)

    if (currentVolume < avgVolume * FILTER.VOLUME_THRESHOLD) {
      filtered.VolumeSpike = null
      filtered.Fibonacci = null
    }
  }

  // 2. Lọc xu hướng
  if (FILTER.ENABLE_TREND_FILTER) {
    const ma = calculateMA(data.closes, FILTER.TREND_MA_PERIOD)
    if (ma.length > 0) {
      const currentMA = ma.at(-1)
      const currentPrice = data.closes.at(-1)
      const isUptrend = currentPrice > currentMA

      if (isUptrend) {
        if (filtered.Stochastic === 'SELL') filtered.Stochastic = null
        if (filtered.ParabolicSAR === 'SELL') filtered.ParabolicSAR = null
      } else {
        if (filtered.Stochastic === 'BUY') filtered.Stochastic = null
        if (filtered.ParabolicSAR === 'BUY') filtered.ParabolicSAR = null
      }
    }
  }

  // 3. Lọc RSI yếu
  if (strategies.RSI) {
    const currentRSI = indicators.rsi.at(-1)
    const threshold =
      strategies.RSI === 'BUY'
        ? STRATEGY_CONFIG.RSI.OVERSOLD + FILTER.RSI_STRENGTH_BUFFER
        : STRATEGY_CONFIG.RSI.OVERBOUGHT - FILTER.RSI_STRENGTH_BUFFER

    if ((strategies.RSI === 'BUY' && currentRSI > threshold) || (strategies.RSI === 'SELL' && currentRSI < threshold)) {
      filtered.RSI = null
    }
  }

  // 4. Lọc MACD yếu
  if (strategies.MACD && indicators.macd.length >= 2) {
    const currentMACD = indicators.macd.at(-1)
    const avgDiff = calculateAverageMACDDiff(indicators.macd)
    const currentDiff = Math.abs(currentMACD.MACD - currentMACD.signal)

    if (currentDiff < avgDiff * FILTER.MACD_STRENGTH_RATIO) {
      filtered.MACD = null
    }
  }

  // 5. Kiểm tra nếu tất cả chiến lược đều là null
  if (Object.values(filtered).every((s) => s === null)) {
    return null
  }

  // 6. Kiểm tra độ mạnh của tín hiệu và sự đồng thuận
  const longCount = Object.values(filtered).filter((s) => s === 'BUY').length
  const shortCount = Object.values(filtered).filter((s) => s === 'SELL').length

  if (
    (longCount >= STRATEGY_CONFIG.STRENGTH_LEVELS.WEAK && longCount > shortCount) ||
    (shortCount >= STRATEGY_CONFIG.STRENGTH_LEVELS.WEAK && longCount < shortCount)
  ) {
    return filtered
  } else {
    return null
  }
}

// Format tín hiệu thay null -> ""
function formatSignals(signals) {
  return Object.fromEntries(Object.entries(signals).map(([k, v]) => [k, v || '']))
}

// Hàm tính TP và SL mới dựa trên ATR
function calculateTPAndSL(decision, strength, currentPrice, highs, lows, closes) {
  const atrPeriod = STRATEGY_CONFIG.ATR.period
  const atrValues = calculateATR(highs, lows, closes, atrPeriod)
  const currentATR = atrValues[atrValues.length - 1] || 0 // Lấy ATR gần nhất

  // Điều chỉnh bội số dựa trên strength (1 đến 3 chiến lược đồng thuận)
  const baseTPMultiplier = 2 + (strength - 1) * 1.2 // TP: 3x - 4.6x
  const baseSLMultiplier = 1 + (strength - 1) * 0.2 // SL: 0.8x - 1.2x

  if (decision === 'Long') {
    const TP = currentPrice + currentATR * baseTPMultiplier
    const SL = currentPrice - currentATR * baseSLMultiplier
    const TP_ROI = ((TP - currentPrice) / currentPrice) * 100
    let SL_ROI = TP_ROI * 2
    if (SL_ROI > 30) SL_ROI = 30
    return {
      TP,
      SL,
      TP_ROI,
      SL_ROI: -SL_ROI,
    }
  } else if (decision === 'Short') {
    const TP = currentPrice - currentATR * baseTPMultiplier
    const SL = currentPrice + currentATR * baseSLMultiplier
    const TP_ROI = ((currentPrice - TP) / currentPrice) * 100
    let SL_ROI = TP_ROI * 2
    if (SL_ROI > 30) SL_ROI = 30
    return {
      TP,
      SL,
      TP_ROI,
      SL_ROI: -SL_ROI,
    }
  }
}

async function analyzeMarket(symbol) {
  try {
    const data = await getHistoricalData(symbol)
    if (!data || data.closes.length < 100) return null

    // Tính toán chỉ báo
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
      ichimoku: {
        highs: data.highs,
        lows: data.lows,
        closes: data.closes,
      },
      stochastic: {
        highs: data.highs,
        lows: data.lows,
        closes: data.closes,
      },
      adx: {
        highs: data.highs,
        lows: data.lows,
        closes: data.closes,
      },
      psar: {
        highs: data.highs,
        lows: data.lows,
      },
    }

    // Thu thập tín hiệu
    const allStrategies = {
      NadarayaUTBot: TradingStrategies.checkNadarayaUTBot(data.closes),
      BollingerBand: TradingStrategies.checkBollingerBand(indicators.bb, data.closes),
      RSI: TradingStrategies.checkRSI(indicators.rsi),
      MACD: TradingStrategies.checkMACD(indicators.macd),
      VolumeSpike: TradingStrategies.checkVolumeSpike(data.closes, data.volumes),
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
      Fibonacci: TradingStrategies.checkFibonacci(data.closes),
    }

    // Lọc tín hiệu
    const filteredStrategies = filterSignals(allStrategies, data, indicators)
    if (filteredStrategies === null) return null

    // Xử lý tín hiệu và tạo output
    const processed = processSignals(filteredStrategies)
    if (processed === null) return null
    const currentPrice = data.closes.at(-1)

    // Tính toán TP và SL với ATR
    const { TP_ROI, SL_ROI } = calculateTPAndSL(
      processed.decision,
      processed.strengthCount,
      currentPrice,
      data.highs,
      data.lows,
      data.closes,
    )
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
    console.error(`Error analyzing ${symbol}:`, error)
    return null
  }
}

module.exports = { getHistoricalData, analyzeMarket, processSignals, filterSignals, calculateTPAndSL }
