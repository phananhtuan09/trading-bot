const { binanceClient } = require('./clients')
const TradingStrategies = require('./tradingStrategies')
const { RSI, BollingerBands, MACD, ADX, EMA, Stochastic, IchimokuCloud, PSAR } = require('technicalindicators')
const { STRATEGY_CONFIG } = require('./config')

async function getHistoricalData(symbol, interval = STRATEGY_CONFIG.INTERVAL) {
  try {
    const candles = await binanceClient.futuresCandles({
      symbol: symbol,
      interval,
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

function calculateMomentum(closes, period = 10) {
  return closes.map((close, index) => {
    if (index < period) return null
    return close - closes[index - period]
  })
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

function filterSignals(strategies, data, indicators, multiTimeframe) {
  //  Thêm tính toán Volume MA
  const volumeMA = data.volumes.length >= 20 ? data.volumes.slice(-20).reduce((a, b) => a + b, 0) / 20 : 0

  const currentATR = indicators.atr.at(-1)
  // Lọc volume
  const dailyVolume = data.volumes.slice(-24).reduce((a, b) => a + b, 0)
  if (dailyVolume < STRATEGY_CONFIG.FILTER.MIN_TRADE_VOLUME) return null

  // Lọc xu hướng
  const ema200 = EMA.calculate({
    period: STRATEGY_CONFIG.FILTER.TREND_MA_PERIOD,
    values: data.closes,
  })
  const currentEma200 = ema200[ema200.length - 1]
  const isPriceAboveEMA200 = data.closes.at(-1) > currentEma200
  if (!isPriceAboveEMA200) return null // Chỉ giao dịch khi giá trên EMA200

  // Tính điểm tin cậy
  let confidenceScore = Object.entries(strategies).reduce((score, [strategy, signal]) => {
    return score + (signal ? STRATEGY_CONFIG.FILTER.STRATEGY_WEIGHTS[strategy] || 1 : 0) + (isPriceAboveEMA200 ? 2 : 0)
  }, 0)

  // Xác nhận đa khung thời gian
  const multiTimeframeConfirm = Object.values(multiTimeframe).filter(
    (tf) => tf.ema && data.closes.at(-1) > tf.ema.at(-1),
  ).length

  confidenceScore += multiTimeframeConfirm * 2

  if (confidenceScore < STRATEGY_CONFIG.FILTER.MIN_CONFIDENCE_SCORE) return null

  // Lọc biến động
  if (currentATR > data.closes.at(-1) * 0.05) return null // Bỏ qua nếu biến động quá cao

  // Kết hợp điều kiện phụ
  const validSignals = Object.entries(strategies).reduce((acc, [strategy, signal]) => {
    if (!signal) return acc

    // Kết hợp RSI và MACD
    if (strategy === 'RSI') {
      // Chỉ kiểm tra khi MACD tồn tại và có giá trị khác null/undefined
      if (strategies.MACD !== undefined && strategies.MACD !== null && strategies.MACD !== signal) {
        return acc
      }
    }
    // Kết hợp Bollinger Bands và Volume
    if (strategy === 'BollingerBands' && volumeMA < STRATEGY_CONFIG.BOLLINGER_BAND.VOLUME_MA_THRESHOLD) return acc

    acc[strategy] = signal
    return acc
  }, {})

  return Object.keys(validSignals).length > 0 ? validSignals : null
}

// Format tín hiệu thay null -> ""
function formatSignals(signals) {
  return Object.fromEntries(Object.entries(signals).map(([k, v]) => [k, v || '']))
}

// Hàm tính TP và SL mới dựa trên ATR
function calculateTPAndSL(decision, strength, currentPrice, indicators) {
  const { atr, volatility } = indicators
  const baseTP = decision === 'Long' ? currentPrice + 3 * atr : currentPrice - 3 * atr

  const baseSL = decision === 'Long' ? currentPrice - 2 * atr : currentPrice + 2 * atr

  // Điều chỉnh theo độ biến động
  const volatilityAdjustment = 1 + volatility / 100
  return {
    TP: baseTP * volatilityAdjustment,
    SL: baseSL / volatilityAdjustment,
    TP_ROI: (((baseTP - currentPrice) / currentPrice) * 100).toFixed(2),
    SL_ROI: (((baseSL - currentPrice) / currentPrice) * 100).toFixed(2),
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
  const atr = []
  for (let i = period - 1; i < tr.length; i++) {
    const sum = tr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
    atr.push(sum / period)
  }
  return atr
}

async function analyzeMarket(symbol) {
  try {
    const data = await getHistoricalData(symbol)
    if (!data || data.closes.length < 100) return null

    const atrValues = calculateATR(data.highs, data.lows, data.closes)
    const currentATR = atrValues.at(-1) || 0
    const currentPrice = data.closes.at(-1)
    const volatility = currentATR ? (currentATR / currentPrice) * 100 : 0

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
    const multiTimeframeAnalysis = {
      '1h': await analyzeTimeframe(symbol, '1h'),
      '4h': await analyzeTimeframe(symbol, '4h'),
      '1d': await analyzeTimeframe(symbol, '1d'),
    }

    // Thu thập tín hiệu
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

    // Tính toán TP và SL với ATR
    const { TP_ROI, SL_ROI } = calculateTPAndSL(processed.decision, processed.strengthCount, currentPrice, indicators)
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
    console.error(`Error analyzing ${symbol}:`, error)
    return null
  }
}

module.exports = { getHistoricalData, analyzeMarket, processSignals, filterSignals, calculateTPAndSL, calculateATR }
