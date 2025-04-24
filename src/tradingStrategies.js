const { IchimokuCloud, Stochastic, ADX, PSAR } = require('technicalindicators')
const { STRATEGY_CONFIG } = require('./config')

class TradingStrategies {
  // Hàm kernel Gaussian dùng để tính trọng số theo phân phối chuẩn
  static gaussianKernel(u) {
    return Math.exp(-0.5 * u * u)
  }

  // Làm mượt dữ liệu chuỗi giá đóng cửa bằng phương pháp Nadaraya-Watson với kernel Gaussian
  static nadarayaWatsonSmoothing(closes, window, h) {
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

  // Chiến lược Nadaraya-Watson
  static checkNadarayaUTBot(closes) {
    const smoothed = this.nadarayaWatsonSmoothing(
      closes,
      STRATEGY_CONFIG.NADARAYA.WINDOW,
      STRATEGY_CONFIG.NADARAYA.BANDWIDTH,
    )

    if (closes.length < 2 || smoothed.length < 2) return null

    const [prevClose, currentClose] = closes.slice(-2)
    const [prevSmoothed, currentSmoothed] = smoothed.slice(-2)

    if (prevClose < prevSmoothed && currentClose > currentSmoothed) return 'BUY'
    if (prevClose > prevSmoothed && currentClose < currentSmoothed) return 'SELL'
    return null
  }

  static calculateMA(values, period) {
    if (values.length < period) return []
    const ma = []
    for (let i = period - 1; i < values.length; i++) {
      const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
      ma.push(sum / period)
    }
    return ma
  }

  // Chiến lược Bollinger Bands
  static checkBollingerBand(bbData, closes, highs, lows, volumes) {
    const { PERIOD, STD_DEV, MIN_BANDWIDTH_PCT, BREAK_THRESHOLD_PCT, VOLUME_MA_PERIOD, ADX_THRESHOLD } =
      STRATEGY_CONFIG.BOLLINGER_BAND

    // Kiểm tra dữ liệu đầu vào
    if (!bbData || bbData.length < PERIOD || closes.length < 200) return null

    const currentClose = closes.at(-1)
    const { upper, lower, middle } = bbData.at(-1)

    // 1. Lọc độ rộng dải Bollinger
    const bandWidthPct = ((upper - lower) / middle) * 100
    if (bandWidthPct < MIN_BANDWIDTH_PCT) return null

    // 2. Lọc ngưỡng vượt band
    const breakThreshold = middle * (BREAK_THRESHOLD_PCT / 100)
    const isValidBreak = currentClose > upper + breakThreshold || currentClose < lower - breakThreshold
    if (!isValidBreak) return null

    // 3. Lọc xu hướng với ADX
    const adxValues = ADX.calculate({
      high: highs.slice(-200),
      low: lows.slice(-200),
      close: closes.slice(-200),
      period: 14,
    })
    if (adxValues.at(-1) < ADX_THRESHOLD) return null

    // 4. Lọc volume
    const volumeMA = volumes.slice(-VOLUME_MA_PERIOD).reduce((a, b) => a + b, 0) / VOLUME_MA_PERIOD
    if (volumes.at(-1) < volumeMA * 1.2) return null // Volume hiện tại > 120% MA20

    // 5. Lọc xu hướng dài hạn
    const ma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / 200
    const trendDirection = currentClose > ma200 ? 'BUY' : 'SELL'

    // Tạo tín hiệu
    if (currentClose > upper + breakThreshold && trendDirection === 'SELL') {
      return 'SELL'
    }
    if (currentClose < lower - breakThreshold && trendDirection === 'BUY') {
      return 'BUY'
    }

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

  // Chiến lược MACD
  static checkMACD(macdOutput) {
    if (!macdOutput || macdOutput.length < 2) return null

    const [prev, current] = macdOutput.slice(-2)

    if (current.MACD > current.signal && prev.MACD <= prev.signal) return 'BUY'
    if (current.MACD < current.signal && prev.MACD >= prev.signal) return 'SELL'
    return null
  }

  // Chiến lược Volume Spike
  static checkVolumeSpike(closes, volumes) {
    if (volumes.length < STRATEGY_CONFIG.VOLUME || closes.length < 2) return null

    const recentVolumes = volumes.slice(-STRATEGY_CONFIG.VOLUME.PERIOD)
    const avgVolume = recentVolumes.reduce((a, b) => a + b) / recentVolumes.length
    const currentVolume = volumes.at(-1)

    if (currentVolume > avgVolume * STRATEGY_CONFIG.VOLUME.THRESHOLD) {
      return closes.at(-1) > closes.at(-2) ? 'BUY' : 'SELL'
    }
    return null
  }
  // Ichimoku Cloud Strategy
  static checkIchimokuCloud(highs, lows, closes) {
    const ichimoku = IchimokuCloud.calculate({
      high: highs,
      low: lows,
      conversionPeriod: STRATEGY_CONFIG.ICHIMOKU.conversionPeriod,
      basePeriod: STRATEGY_CONFIG.ICHIMOKU.basePeriod,
      spanPeriod: STRATEGY_CONFIG.ICHIMOKU.spanPeriod,
      displacement: STRATEGY_CONFIG.ICHIMOKU.displacement,
    })

    if (ichimoku.length < 1) return null
    const current = closes.at(-1)
    const lastIchi = ichimoku.at(-1)

    // Tín hiệu khi giá nằm trên đám mây và Tenkan-sen > Kijun-sen
    if (current > lastIchi.senkouSpanA && current > lastIchi.senkouSpanB && lastIchi.tenkanSen > lastIchi.kijunSen) {
      return 'BUY'
    }

    // Tín hiệu khi giá nằm dưới đám mây và Tenkan-sen < Kijun-sen
    if (current < lastIchi.senkouSpanA && current < lastIchi.senkouSpanB && lastIchi.tenkanSen < lastIchi.kijunSen) {
      return 'SELL'
    }

    return null
  }

  // Stochastic Oscillator Strategy
  static checkStochastic(highs, lows, closes) {
    const stochastic = Stochastic.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: STRATEGY_CONFIG.STOCHASTIC.period,
      signalPeriod: STRATEGY_CONFIG.STOCHASTIC.signalPeriod,
    })

    if (stochastic.length < 2) return null
    const [prev, current] = stochastic.slice(-2)

    // Tín hiệu khi %K cắt lên trên %D từ vùng quá bán
    if (prev.k < prev.d && current.k > current.d && current.k < 20) {
      return 'BUY'
    }

    // Tín hiệu khi %K cắt xuống dưới %D từ vùng quá mua
    if (prev.k > prev.d && current.k < current.d && current.k > 80) {
      return 'SELL'
    }

    return null
  }

  // ADX Strategy
  static checkADX(highs, lows, closes) {
    const adx = ADX.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: STRATEGY_CONFIG.ADX.period,
    })

    if (adx.length < 1) return null
    const currentADX = adx.at(-1)

    // Xu hướng mạnh khi ADX > 25 và +DI > -DI
    if (currentADX.adx > STRATEGY_CONFIG.ADX.strongTrendThreshold && currentADX.pdi > currentADX.mdi) {
      return 'BUY'
    }

    // Xu hướng mạnh khi ADX > 25 và -DI > +DI
    if (currentADX.adx > STRATEGY_CONFIG.ADX.strongTrendThreshold && currentADX.mdi > currentADX.pdi) {
      return 'SELL'
    }

    return null
  }

  // Parabolic SAR Strategy
  static checkParabolicSAR(highs, lows) {
    const psar = PSAR.calculate({
      high: highs,
      low: lows,
      step: STRATEGY_CONFIG.PARABOLIC_SAR.step,
      max: STRATEGY_CONFIG.PARABOLIC_SAR.max,
    })

    if (psar.length < 2) return null
    const [prev, current] = psar.slice(-2)

    // Tín hiệu đảo chiều tăng khi SAR nằm dưới giá
    if (current > prev) return 'BUY'

    // Tín hiệu đảo chiều giảm khi SAR nằm trên giá
    if (current < prev) return 'SELL'

    return null
  }

  // Fibonacci Retracement Strategy
  static checkFibonacci(closes) {
    if (closes.length < STRATEGY_CONFIG.FIBONACCI.lookbackPeriod) return null

    // Tìm swing high và swing low
    const lookback = closes.slice(-STRATEGY_CONFIG.FIBONACCI.lookbackPeriod)
    const swingHigh = Math.max(...lookback)
    const swingLow = Math.min(...lookback)
    const diff = swingHigh - swingLow

    // Tính các mức retracement
    const levels = STRATEGY_CONFIG.FIBONACCI.retracementLevels.map((l) => ({
      level: l,
      price: swingHigh - diff * l,
    }))

    const currentPrice = closes.at(-1)

    // Kiểm tra các mức hỗ trợ/kháng cự
    for (const { level, price } of levels) {
      if (Math.abs(currentPrice - price) < price * 0.005) {
        // Trong phạm vi 0.5%
        if (level >= 0.618 && currentPrice > price) return 'BUY'
        if (level >= 0.618 && currentPrice < price) return 'SELL'
      }
    }

    return null
  }
}

module.exports = TradingStrategies
