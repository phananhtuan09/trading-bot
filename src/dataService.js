const { binanceClient } = require('./clients')
const TradingStrategies = require('./tradingStrategies')
const { EMA, RSI } = require('technicalindicators')
const { STRATEGY_CONFIG } = require('./config')

async function getHistoricalData(symbol) {
  try {
    const candles = await binanceClient.futuresCandles({
      symbol: symbol,
      interval: STRATEGY_CONFIG.interval,
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

    const emaShort = EMA.calculate({ period: STRATEGY_CONFIG.emaPeriods.short, values: data.closes })
    const emaLong = EMA.calculate({ period: STRATEGY_CONFIG.emaPeriods.long, values: data.closes })
    const rsi = RSI.calculate({ values: data.closes, period: STRATEGY_CONFIG.rsiPeriod })
    const lastRSI = rsi.at(-1)
    const signals = {
      breakout: TradingStrategies.checkBreakout(
        data.highs,
        data.lows,
        data.closes,
        data.volumes,
        emaShort,
        emaLong,
        lastRSI,
      ),
      bollingerBand: TradingStrategies.checkBollingerBand(data.closes, emaShort, emaLong, lastRSI),
    }

    // Điều chỉnh đòn bẩy khi có nhiều tín hiệu
    const price = data.closes.at(-1)

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
      price: parseFloat(price),
      futuresDetails,
    }
  } catch (error) {
    console.error(`Lỗi phân tích ${symbol}:`, error)
    return null
  }
}

module.exports = { getHistoricalData, analyzeMarket }
