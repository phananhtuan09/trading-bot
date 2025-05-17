const { IchimokuCloud, Stochastic, ADX, PSAR, RSI, BollingerBands } = require('technicalindicators')
const { STRATEGY_CONFIG } = require('./config')

class TradingStrategies {
  // Chiến lược Bollinger Bands
  static checkBollingerBands(bb, closes) {
    const price = closes[closes.length - 1]
    const bandwidth = (bb[bb.length - 1].upper - bb[bb.length - 1].lower) / bb[bb.length - 1].middle
    if (bandwidth < STRATEGY_CONFIG.BOLLINGER_BAND.MIN_BANDWIDTH_PCT / 100) return null
    if (
      price <
      bb[bb.length - 1].lower + (STRATEGY_CONFIG.BOLLINGER_BAND.BREAK_THRESHOLD_PCT / 100) * bb[bb.length - 1].middle
    )
      return 'BUY'
    if (
      price >
      bb[bb.length - 1].upper - (STRATEGY_CONFIG.BOLLINGER_BAND.BREAK_THRESHOLD_PCT / 100) * bb[bb.length - 1].middle
    )
      return 'SELL'
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
    if (!stochastic || stochastic.length === 0) return null
    const current = stochastic.at(-1)
    if (current.k === undefined || current.d === undefined) return null
    if (
      current.k < 20 &&
      current.d < 20 &&
      current.k > current.d &&
      stochastic.length > 1 &&
      stochastic.at(-2).k <= stochastic.at(-2).d
    )
      return 'BUY'
    if (
      current.k > 80 &&
      current.d > 80 &&
      current.k < current.d &&
      stochastic.length > 1 &&
      stochastic.at(-2).k >= stochastic.at(-2).d
    )
      return 'SELL'
    return null
  }

  static checkADX(adx) {
    if (!adx || adx.length === 0) return null
    const current = adx.at(-1)
    if (current.adx === undefined || current.pdi === undefined || current.mdi === undefined) return null
    if (current.adx > STRATEGY_CONFIG.ADX.STRONG_TREND_THRESHOLD) {
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
    if (!psarValues || psarValues.length < 1) return null
    const currentPSAR = psarValues.at(-1)
    if (currentPSAR === undefined) return null
    if (price > currentPSAR) return 'BUY'
    if (price < currentPSAR) return 'SELL'
    return null
  }

  static checkMomentum(momentumValues) {
    if (!momentumValues || momentumValues.length < 2) return null
    const currentMomentum = momentumValues.at(-1)
    const prevMomentum = momentumValues.at(-2)
    if (currentMomentum === null || prevMomentum === null) return null
    if (STRATEGY_CONFIG.MOMENTUM.CROSSOVER_ZERO) {
      if (currentMomentum > 0 && prevMomentum <= 0) return 'BUY'
      if (currentMomentum < 0 && prevMomentum >= 0) return 'SELL'
    } else {
      if (currentMomentum > 0 && currentMomentum > prevMomentum) return 'BUY'
      if (currentMomentum < 0 && currentMomentum < prevMomentum) return 'SELL'
    }
    return null
  }
}

module.exports = TradingStrategies
