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
  if (signalGroups.BUY.count > signalGroups.SELL.count) {
    decision = 'Long'
  } else if (signalGroups.SELL.count > signalGroups.BUY.count) {
    decision = 'Short'
  }

  return { decision, futuresDetails }
}

// Format tín hiệu thay null -> NONE
function formatSignals(signals) {
  return Object.fromEntries(Object.entries(signals).map(([k, v]) => [k, v || '']))
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

    // Kiểm tra nếu tất cả đều null
    if (Object.values(allStrategies).every((s) => s === null)) return null

    // Xử lý tín hiệu và tạo output
    const processed = processSignals(allStrategies)

    return {
      symbol,
      signals: formatSignals(allStrategies),
      decision: processed.decision,
      futuresDetails: processed.futuresDetails,
      price: data.closes.at(-1),
    }
  } catch (error) {
    console.error(`Error analyzing ${symbol}:`, error)
    return null
  }
}

module.exports = { getHistoricalData, analyzeMarket, processSignals }
