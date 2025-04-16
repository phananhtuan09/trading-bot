const { BollingerBands, EMA } = require('technicalindicators')
const { STRATEGY_CONFIG } = require('./config')

class TradingStrategies {
  // Hàm kernel Gaussian dùng để tính trọng số theo phân phối chuẩn
  static gaussianKernel(u) {
    return Math.exp(-0.5 * u * u)
  }

  // Làm mượt dữ liệu chuỗi giá đóng cửa bằng phương pháp Nadaraya-Watson với kernel Gaussian
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

  // Kiểm tra tín hiệu giao dịch dựa trên phương pháp Nadaraya-Watson kết hợp UTBot
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
    // Tính trung bình khối lượng gần nhất
    const recentVolumes = volumes.slice(i - STRATEGY_CONFIG.VOLUME_LOOKBACK, i)
    const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / STRATEGY_CONFIG.VOLUME_LOOKBACK

    const currentVolume = volumes[i]
    const volumeThreshold = STRATEGY_CONFIG.VOLUME_THRESHOLD

    const lastRSI = rsiValues.at(-1)

    // Tín hiệu BUY khi: giá vượt lên đường smoothed + volume tăng + RSI đang quá bán
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

    // Tín hiệu SELL khi: giá rơi xuống dưới đường smoothed + volume tăng + RSI đang quá mua
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

  // Kiểm tra tín hiệu giao dịch dựa vào Bollinger Bands, EMA và RSI
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

    // Tính khối lượng trung bình gần đây
    const avgVolume =
      volumes.slice(-STRATEGY_CONFIG.VOLUME_LOOKBACK).reduce((a, b) => a + b, 0) / STRATEGY_CONFIG.VOLUME_LOOKBACK
    const lastRSI = rsiValues.at(-1)
    const prevRSI = rsiValues.at(-2) || lastRSI

    // Tính các đường EMA ngắn hạn và dài hạn để xác định xu hướng
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

    // Mô hình đảo chiều tăng giá (bullish reversal)
    const bullishReversal = current > prev1 && currentHigh > currentUpper && current > (currentHigh + currentLow) / 2
    // Mô hình đảo chiều giảm giá (bearish reversal)
    const bearishReversal = current < prev1 && currentLow < currentLower && current < (currentHigh + currentLow) / 2

    // Tín hiệu BUY khi giá vượt qua dải dưới Bollinger và có bullish reversal trong xu hướng tăng
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

    // Tín hiệu SELL khi giá rơi xuống dưới dải trên Bollinger và có bearish reversal trong xu hướng giảm
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
