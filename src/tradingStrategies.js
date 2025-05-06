const { IchimokuCloud, Stochastic, ADX, PSAR, RSI, BollingerBands } = require('technicalindicators')
const { STRATEGY_CONFIG } = require('./config')

class TradingStrategies {
  // Chiến lược Bollinger Bands
  static checkBollingerBands(bb, closes) {
    const price = closes[closes.length - 1]
    if (price < bb[bb.length - 1].lower) return 'BUY'
    if (price > bb[bb.length - 1].upper) return 'SELL'
    return null
  }

  // Chiến lược RSI
  static checkRSI(rsiValues) {
    if (!rsiValues || rsiValues.length < 1) return null

    const currentRSI = rsiValues.at(-1)

    if (currentRSI < STRATEGY_CONFIG.RSI.OVERSOLD) return 'BUY'
    if (currentRSI > STRATEGY_CONFIG.RSI.OVERBOUGHT) return 'SELL'
    return null
  }

  static checkSMA(emaShort, emaLong) {
    if (emaShort[emaShort.length - 1] > emaLong[emaLong.length - 1]) return 'BUY'
    if (emaShort[emaShort.length - 1] < emaLong[emaLong.length - 1]) return 'SELL'
    return null
  }

  // Chiến lược MACD
  static checkMACD(macdOutput) {
    if (!macdOutput || macdOutput.length < 2) return null

    const [prev, current] = macdOutput.slice(-2)

    if (current.MACD > current.signal && prev.MACD <= prev.signal) return 'BUY'
    if (current.MACD < current.signal && prev.MACD >= prev.signal) return 'SELL'
    return null
  }

  static checkStochastic(stochastic) {
    const current = stochastic[stochastic.length - 1]
    if (current.k < 20 && current.d < 20 && current.k > current.d) return 'BUY'
    if (current.k > 80 && current.d > 80 && current.k < current.d) return 'SELL'
    return null
  }

  static checkADX(adx) {
    const current = adx[adx.length - 1]
    if (current.adx > STRATEGY_CONFIG.ADX.strongTrendThreshold) {
      if (current.pdi > current.mdi) return 'BUY'
      if (current.mdi > current.pdi) return 'SELL'
    }
    return null
  }

  static checkIchimoku(ichimoku, price, highs, lows) {
    if (!ichimoku || ichimoku.length < 52) return null
    const current = ichimoku[ichimoku.length - 1]

    const priceAboveCloud = price > current.senkouSpanA && price > current.senkouSpanB
    const priceBelowCloud = price < current.senkouSpanA && price < current.senkouSpanB
    const tenkanAboveKijun = current.tenkanSen > current.kijunSen
    const chikouBullish = lows[lows.length - 26] < current.chikouSpan
    const cloudBullish = current.senkouSpanA < current.senkouSpanB

    if (priceAboveCloud && tenkanAboveKijun && chikouBullish && cloudBullish) return 'BUY'
    if (priceBelowCloud && !tenkanAboveKijun && !chikouBullish && !cloudBullish) return 'SELL'
    return null
  }

  static checkPSAR(psarValues, price) {
    if (!psarValues || psarValues.length < 2) return null
    const current = psarValues[psarValues.length - 1]
    const prev = psarValues[psarValues.length - 2]

    if (price > current && current > prev) return 'BUY'
    if (price < current && current < prev) return 'SELL'
    return null
  }

  static checkMomentum(momentumValues) {
    if (!momentumValues || momentumValues.length < 2) return null
    const current = momentumValues[momentumValues.length - 1]
    const prev = momentumValues[momentumValues.length - 2]

    if (current > 100 && current > prev) return 'BUY'
    if (current < 100 && current < prev) return 'SELL'
    return null
  }
}

module.exports = TradingStrategies
