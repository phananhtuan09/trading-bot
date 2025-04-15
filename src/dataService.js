const { binanceClient } = require('./clients')
const TradingStrategies = require('./tradingStrategies')
const { RSI, BollingerBands } = require('technicalindicators')
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

async function analyzeMarket(symbol) {
  try {
    const data = await getHistoricalData(symbol)
    if (!data || data.closes.length < 100) return null

    // Tính toán các chỉ báo
    const rsi = RSI.calculate({ values: data.closes, period: STRATEGY_CONFIG.RSI_PERIOD })
    const bb = BollingerBands.calculate({
      period: STRATEGY_CONFIG.BB_PERIOD,
      values: data.closes,
      stdDev: STRATEGY_CONFIG.STD_DEV,
    })

    // Tính độ rộng Bollinger Bands
    const bbWidth = bb.map((b) => (b.upper - b.lower) / b.middle)
    const recentBBWidth = bbWidth.slice(-STRATEGY_CONFIG.BREAKOUT_PERIOD)
    const avgBBWidth = recentBBWidth.reduce((a, b) => a + b, 0) / STRATEGY_CONFIG.BREAKOUT_PERIOD
    const isVolatileMarket = avgBBWidth > STRATEGY_CONFIG.BB_SQUEEZE_THRESHOLD

    // Lọc tín hiệu theo market regime
    const signals = {
      BollingerBand: isVolatileMarket
        ? TradingStrategies.checkBollingerBand(data.closes, data.highs, data.lows, data.volumes, rsi)
        : null,
      NadarayaUTbot: isVolatileMarket ? TradingStrategies.checkNadarayaUTBot(data.closes, data.volumes, rsi) : null,
    }

    const futuresDetails = {}

    for (const [strategyName, result] of Object.entries(signals)) {
      if (result) {
        futuresDetails[strategyName] = {
          direction: result.action === 'BUY' ? 'Long' : 'Short',
        }
      }
    }

    return {
      symbol,
      signals,
      price: parseFloat(data.closes.at(-1)),
      futuresDetails,
    }
  } catch (error) {
    console.error(`Lỗi phân tích ${symbol}:`, error)
    return null
  }
}

module.exports = { getHistoricalData, analyzeMarket }
