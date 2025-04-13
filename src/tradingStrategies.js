const { BollingerBands, MACD, EMA, RSI, ATR, SMA } = require('technicalindicators')
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

  // origin
  // static checkBollingerBand(closes, emaShort, emaLong, rsi) {
  //   try {
  //     const bb = BollingerBands.calculate({
  //       period: STRATEGY_CONFIG.bbPeriod,
  //       values: closes,
  //       stdDev: STRATEGY_CONFIG.stdDev,
  //     })
  //     if (bb.length < 2) return null
  //     const lastClose = closes.at(-1)
  //     const { upper, lower } = bb.at(-1)
  //     // Đánh giá isStrong cho tín hiệu Bollinger dựa trên việc chạm gần biên
  //     const isStrong = lastClose <= lower || lastClose >= upper

  //     // Tín hiệu mua khi giá chạm dải dưới + điều kiện RSI và EMA
  //     if (lastClose <= lower && rsi < STRATEGY_CONFIG.rsiThresholds.oversold && emaShort.at(-1) > emaLong.at(-1)) {
  //       return { action: 'BUY', isStrong }
  //     }

  //     // Tín hiệu bán khi giá chạm dải trên + điều kiện RSI và EMA
  //     if (lastClose >= upper && rsi > STRATEGY_CONFIG.rsiThresholds.overbought && emaShort.at(-1) < emaLong.at(-1)) {
  //       return { action: 'SELL', isStrong }
  //     }
  //     return null
  //   } catch (error) {
  //     console.error('Bollinger Band Error:', error)
  //     return null
  //   }
  // }

  static checkBollingerBand(closes, volumes, rsiValues) {
    const bb = BollingerBands.calculate({
      period: STRATEGY_CONFIG.bbPeriod,
      values: closes,
      stdDev: STRATEGY_CONFIG.stdDev,
    })
    if (bb.length < 2) return null

    const lastClose = closes.at(-1)
    const prevClose = closes.at(-2)
    const { upper, lower } = bb.at(-1)
    const prevLower = bb.at(-2).lower
    const prevUpper = bb.at(-2).upper

    // Tính volume trung bình 20 nến
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20

    // Lấy RSI hiện tại
    const lastRSI = rsiValues.at(-1)

    // Tín hiệu mua
    if (
      prevClose < prevLower &&
      lastClose > lower &&
      volumes.at(-1) > avgVolume * STRATEGY_CONFIG.volumeThreshold && // Volume cao hơn 50% trung bình
      lastRSI < STRATEGY_CONFIG.rsiThresholds.oversold // RSI trong vùng quá bán
    ) {
      return 'BUY'
    }

    // Tín hiệu bán
    if (
      prevClose > prevUpper &&
      lastClose < upper &&
      volumes.at(-1) > avgVolume * STRATEGY_CONFIG.volumeThreshold && // Volume cao hơn 50% trung bình
      lastRSI > STRATEGY_CONFIG.rsiThresholds.overbought // RSI trong vùng quá mua
    ) {
      return 'SELL'
    }

    return null
  }

  static checkMACD_RSI_Volume(closes, volumes, rsi) {
    try {
      // Calculate MACD with standard parameters (12, 26, 9)
      const macd = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
      })
      if (macd.length < 2) return null // Need at least 2 values to compare

      // Calculate EMA50 and EMA200 to determine the trend
      const ema50 = EMA.calculate({ period: 50, values: closes })
      const ema200 = EMA.calculate({ period: 200, values: closes })
      if (ema50.length < 1 || ema200.length < 1) return null

      // Get the latest values
      const lastMacd = macd[macd.length - 1] // { MACD, signal, histogram }
      const prevMacd = macd[macd.length - 2]
      const lastRSI = rsi[rsi.length - 1]
      const lastVolume = volumes[volumes.length - 1]
      const avgVolume = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10
      const lastEMA50 = ema50[ema50.length - 1]
      const lastEMA200 = ema200[ema200.length - 1]
      const isUptrend = lastEMA50 > lastEMA200

      // Buy signal conditions
      if (
        lastMacd.MACD > lastMacd.signal &&
        prevMacd.MACD <= prevMacd.signal &&
        lastRSI >= 30 &&
        lastRSI <= 50 &&
        lastVolume > avgVolume &&
        isUptrend
      ) {
        // Determine if the buy signal is strong
        const isStrong =
          lastMacd.histogram > 0 && // Positive histogram
          lastRSI < 35 && // RSI lower than typical threshold
          lastVolume > 1.5 * avgVolume && // Volume significantly above average
          lastEMA50 > 1.005 * lastEMA200 // Strong uptrend

        return { action: 'BUY', isStrong }
      }

      // Sell signal conditions
      if (
        lastMacd.MACD < lastMacd.signal &&
        prevMacd.MACD >= prevMacd.signal &&
        lastRSI >= 50 &&
        lastRSI <= 70 &&
        lastVolume > avgVolume &&
        !isUptrend
      ) {
        // Determine if the sell signal is strong
        const isStrong =
          lastMacd.histogram < 0 && // Negative histogram
          lastRSI > 65 && // RSI higher than typical threshold
          lastVolume > 1.5 * avgVolume && // Volume significantly above average
          lastEMA50 < 0.995 * lastEMA200 // Strong downtrend

        return { action: 'SELL', isStrong }
      }

      return null // No signal
    } catch (error) {
      console.error('Error in checkMACD_RSI_Volume:', error)
      return null
    }
  }
}

module.exports = TradingStrategies
