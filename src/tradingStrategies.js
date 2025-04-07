const { BollingerBands } = require('technicalindicators')
const { STRATEGY_CONFIG } = require('./config')

class TradingStrategies {
  static checkBreakout(highs, lows, closes, volumes, emaShort, emaLong, rsi) {
    try {
      const lookback = STRATEGY_CONFIG.breakoutPeriod
      const currentHigh = highs.slice(-lookback)
      const currentLow = lows.slice(-lookback)
      const resistance = Math.max(...currentHigh)
      const support = Math.min(...currentLow)
      const lastPrice = closes.at(-1)
      const lastVolume = volumes.at(-1)
      const avgVolume =
        volumes.slice(-STRATEGY_CONFIG.volumeLookback).reduce((a, b) => a + b, 0) / STRATEGY_CONFIG.volumeLookback

      // Tính toán isStrong dựa trên volume vượt ngưỡng cao hơn 20%
      const isStrong = lastVolume > avgVolume * STRATEGY_CONFIG.riskManagement.volumeMultiplier * 1.2

      // Điều kiện breakout mua
      if (
        lastPrice > resistance &&
        rsi < STRATEGY_CONFIG.rsiThresholds.overbought &&
        emaShort.at(-1) > emaLong.at(-1) &&
        lastVolume > avgVolume * STRATEGY_CONFIG.riskManagement.volumeMultiplier
      ) {
        return { action: 'BUY', isStrong }
      }

      // Điều kiện breakout bán
      if (
        lastPrice < support &&
        rsi > STRATEGY_CONFIG.rsiThresholds.oversold &&
        emaShort.at(-1) < emaLong.at(-1) &&
        lastVolume > avgVolume * STRATEGY_CONFIG.riskManagement.volumeMultiplier
      ) {
        return { action: 'SELL', isStrong }
      }
      return null
    } catch (error) {
      console.error('Breakout Error:', error)
      return null
    }
  }

  static checkBollingerBand(closes, emaShort, emaLong, rsi) {
    try {
      const bb = BollingerBands.calculate({
        period: STRATEGY_CONFIG.bbPeriod,
        values: closes,
        stdDev: STRATEGY_CONFIG.stdDev,
      })
      if (bb.length < 2) return null
      const lastClose = closes.at(-1)
      const { upper, lower } = bb.at(-1)
      // Đánh giá isStrong cho tín hiệu Bollinger dựa trên việc chạm gần biên
      const isStrong = lastClose <= lower || lastClose >= upper

      // Tín hiệu mua khi giá chạm dải dưới + điều kiện RSI và EMA
      if (lastClose <= lower && rsi < STRATEGY_CONFIG.rsiThresholds.oversold && emaShort.at(-1) > emaLong.at(-1)) {
        return { action: 'BUY', isStrong }
      }

      // Tín hiệu bán khi giá chạm dải trên + điều kiện RSI và EMA
      if (lastClose >= upper && rsi > STRATEGY_CONFIG.rsiThresholds.overbought && emaShort.at(-1) < emaLong.at(-1)) {
        return { action: 'SELL', isStrong }
      }
      return null
    } catch (error) {
      console.error('Bollinger Band Error:', error)
      return null
    }
  }
}

module.exports = TradingStrategies
