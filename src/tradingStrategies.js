const { BollingerBands, EMA } = require('technicalindicators')
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
      STRATEGY_CONFIG.NADARAYA_WINDOW,
      STRATEGY_CONFIG.NADARAYA_BANDWIDTH,
    )

    if (smoothed.length < 2) return null

    const i = closes.length - 1
    const prevClose = closes[i - 1]
    const currentClose = closes[i]
    const prevSmoothed = smoothed[i - 1]
    const currentSmoothed = smoothed[i]

    if (i < STRATEGY_CONFIG.VOLUME_LOOKBACK) return null
    const recentVolumes = volumes.slice(i - STRATEGY_CONFIG.VOLUME_LOOKBACK, i)
    const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / STRATEGY_CONFIG.VOLUME_LOOKBACK

    const currentVolume = volumes[i]
    const volumeThreshold = STRATEGY_CONFIG.VOLUME_THRESHOLD

    const lastRSI = rsiValues.at(-1)

    // Tín hiệu mua
    if (
      prevClose < prevSmoothed &&
      currentClose > currentSmoothed &&
      currentVolume > avgVolume * volumeThreshold &&
      lastRSI < STRATEGY_CONFIG.RSI_THRESHOLDS.OVERSOLD
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
      lastRSI > STRATEGY_CONFIG.RSI_THRESHOLDS.OVERBOUGHT
    ) {
      return {
        action: 'SELL',
      }
    }

    return null
  }

  static checkBollingerBand(closes, highs, lows, volumes, rsiValues) {
    const bb = BollingerBands.calculate({
      period: STRATEGY_CONFIG.BB_PERIOD,
      values: closes,
      stdDev: STRATEGY_CONFIG.STD_DEV,
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
      volumes.slice(-STRATEGY_CONFIG.VOLUME_LOOKBACK).reduce((a, b) => a + b, 0) / STRATEGY_CONFIG.VOLUME_LOOKBACK
    const lastRSI = rsiValues.at(-1)
    const prevRSI = rsiValues.at(-2) || lastRSI

    // Điều kiện trend
    const ema20 = EMA.calculate({
      period: STRATEGY_CONFIG.EMA_PERIODS.SHORT,
      values: closes,
    })
    const ema50 = EMA.calculate({
      period: STRATEGY_CONFIG.EMA_PERIODS.LONG,
      values: closes,
    })
    const isBullTrend = ema20.at(-1) > ema50.at(-1)
    const isBearTrend = ema20.at(-1) < ema50.at(-1)

    // Pattern xác nhận
    const bullishReversal = current > prev1 && currentHigh > currentUpper && current > (currentHigh + currentLow) / 2

    const bearishReversal = current < prev1 && currentLow < currentLower && current < (currentHigh + currentLow) / 2

    // Điều kiện BUY
    if (
      prev1 < prevLower &&
      current > currentLower &&
      bullishReversal &&
      volumes.at(-1) > avgVolume * STRATEGY_CONFIG.VOLUME_THRESHOLD &&
      lastRSI > STRATEGY_CONFIG.RSI_THRESHOLDS.OVERSOLD &&
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
      volumes.at(-1) > avgVolume * STRATEGY_CONFIG.VOLUME_THRESHOLD &&
      lastRSI < STRATEGY_CONFIG.RSI_THRESHOLDS.OVERBOUGHT &&
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
