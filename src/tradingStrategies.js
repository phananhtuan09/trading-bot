const { BollingerBands, EMA, ATR, MACD, ADX } = require('technicalindicators')
const { STRATEGY_CONFIG } = require('./config')

class TradingStrategies {
  // Hàm kernel Gaussian
  static gaussianKernel(u) {
    return Math.exp(-0.5 * u * u)
  }

  // Hàm tính Nadaraya-Watson smoothing
  static nadarayaWatsonSmoothing(closes, window = 50, h = 10) {
    const smoothed = []
    for (let i = 0; i < closes.length; i++) {
      let sumWeights = 0
      let sumWeightedValues = 0
      const start = Math.max(0, i - window + 1)
      for (let j = start; j <= i; j++) {
        const u = (i - j) / h
        const weight = this.gaussianKernel(u)
        sumWeights += weight
        sumWeightedValues += weight * closes[j]
      }
      smoothed.push(sumWeightedValues / sumWeights)
    }
    return smoothed
  }

  static checkNadarayaUTBot(closes, volumes, rsiValues) {
    const smoothed = this.nadarayaWatsonSmoothing(
      closes,
      STRATEGY_CONFIG.nadarayaWindow,
      STRATEGY_CONFIG.nadarayaBandwidth,
    )

    if (smoothed.length < 2) return null

    const i = closes.length - 1
    const prevClose = closes[i - 1]
    const currentClose = closes[i]
    const prevSmoothed = smoothed[i - 1]
    const currentSmoothed = smoothed[i]

    if (i < STRATEGY_CONFIG.volumeLookback) return null
    const recentVolumes = volumes.slice(i - STRATEGY_CONFIG.volumeLookback, i)
    const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / STRATEGY_CONFIG.volumeLookback

    const currentVolume = volumes[i]
    const volumeThreshold = STRATEGY_CONFIG.volumeThreshold

    const lastRSI = rsiValues.at(-1)

    // Tín hiệu mua
    if (
      prevClose < prevSmoothed &&
      currentClose > currentSmoothed &&
      currentVolume > avgVolume * volumeThreshold &&
      lastRSI < STRATEGY_CONFIG.rsiThresholds.oversold // Điều kiện RSI
    ) {
      return {
        action: 'BUY',
      }
    }

    // Tín hiệu bán
    if (
      prevClose > prevSmoothed &&
      currentClose < currentSmoothed &&
      currentVolume > avgVolume * volumeThreshold &&
      lastRSI > STRATEGY_CONFIG.rsiThresholds.overbought // Điều kiện RSI
    ) {
      return {
        action: 'SELL',
      }
    }

    return null
  }

  static checkBollingerBand(closes, highs, lows, volumes, rsiValues) {
    const bb = BollingerBands.calculate({
      period: STRATEGY_CONFIG.bbPeriod,
      values: closes,
      stdDev: STRATEGY_CONFIG.stdDev,
    })

    if (bb.length < 3) return null

    // Chỉ lấy các giá trị thực sự cần dùng
    const prev1 = closes.at(-2)
    const current = closes.at(-1)
    const currentHigh = highs.at(-1)
    const currentLow = lows.at(-1)

    // Chỉ lấy các thành phần BB cần thiết
    const { upper: currentUpper, lower: currentLower } = bb.at(-1)
    const { upper: prevUpper, lower: prevLower } = bb.at(-2)

    // Các chỉ báo bổ sung
    const avgVolume =
      volumes.slice(-STRATEGY_CONFIG.volumeLookback).reduce((a, b) => a + b, 0) / STRATEGY_CONFIG.volumeLookback
    const lastRSI = rsiValues.at(-1)
    const prevRSI = rsiValues.at(-2) || lastRSI

    // Điều kiện trend
    const ema20 = EMA.calculate({
      period: STRATEGY_CONFIG.emaPeriods.short,
      values: closes,
    })
    const ema50 = EMA.calculate({
      period: STRATEGY_CONFIG.emaPeriods.long,
      values: closes,
    })
    const isBullTrend = ema20.at(-1) > ema50.at(-1)
    const isBearTrend = ema20.at(-1) < ema50.at(-1)

    // Pattern xác nhận (đã bỏ biến thừa)
    const bullishReversal = current > prev1 && currentHigh > currentUpper && current > (currentHigh + currentLow) / 2

    const bearishReversal = current < prev1 && currentLow < currentLower && current < (currentHigh + currentLow) / 2

    // Điều kiện BUY
    if (
      prev1 < prevLower &&
      current > currentLower &&
      bullishReversal &&
      volumes.at(-1) > avgVolume * STRATEGY_CONFIG.volumeThreshold &&
      lastRSI > STRATEGY_CONFIG.rsiThresholds.oversold &&
      lastRSI > prevRSI &&
      isBullTrend
    ) {
      return {
        action: 'BUY',
      }
    }

    // Điều kiện SELL
    if (
      prev1 > prevUpper &&
      current < currentUpper &&
      bearishReversal &&
      volumes.at(-1) > avgVolume * STRATEGY_CONFIG.volumeThreshold &&
      lastRSI < STRATEGY_CONFIG.rsiThresholds.overbought &&
      lastRSI < prevRSI &&
      isBearTrend
    ) {
      return {
        action: 'SELL',
      }
    }

    return null
  }
}

module.exports = TradingStrategies
