const { IchimokuCloud, Stochastic, ADX, PSAR, RSI, BollingerBands } = require('technicalindicators')
const { STRATEGY_CONFIG } = require('./config')

class TradingStrategies {
  // Hàm kernel Gaussian dùng để tính trọng số theo phân phối chuẩn
  static gaussianKernel(u) {
    return Math.exp(-0.5 * u * u)
  }

  // Hàm tính EMA
  static calculateEMA(values, period) {
    if (values.length < period) return []
    const k = 2 / (period + 1)
    const ema = [values.slice(0, period).reduce((a, b) => a + b, 0) / period]
    for (let i = period; i < values.length; i++) {
      ema.push(values[i] * k + ema[ema.length - 1] * (1 - k))
    }
    return ema
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
  static checkNadarayaUTBot(closes, volumes) {
    const smoothed = this.nadarayaWatsonSmoothing(
      closes,
      STRATEGY_CONFIG.NADARAYA.WINDOW,
      STRATEGY_CONFIG.NADARAYA.BANDWIDTH,
    )

    // Kiểm tra điều kiện cơ bản
    if (closes.length < 200 || smoothed.length < 2) return null
    const [prevClose, currentClose] = closes.slice(-2)
    const [prevSmoothed, currentSmoothed] = smoothed.slice(-2)

    // Xác định tín hiệu ban đầu
    let signal = null
    if (prevClose < prevSmoothed && currentClose > currentSmoothed) signal = 'BUY'
    if (prevClose > prevSmoothed && currentClose < currentSmoothed) signal = 'SELL'
    if (!signal) return null

    // Tính toán các chỉ báo bổ sung
    const ma200 = this.calculateMA(closes, 200).at(-1)
    const rsi = RSI.calculate({ values: closes, period: 14 }).at(-1)
    const volumeMA20 = this.calculateMA(volumes, 20).at(-1)
    const currentVolume = volumes.at(-1)

    // Bộ lọc nâng cao
    if (signal === 'BUY') {
      if (
        currentClose < ma200 ||
        rsi > 60 ||
        currentVolume < volumeMA20 * 1.5 ||
        currentClose < currentSmoothed * 1.01 // Xác nhận động lượng
      )
        return null
    } else {
      if (currentClose > ma200 || rsi < 40 || currentVolume < volumeMA20 * 1.5 || currentClose > currentSmoothed * 0.99)
        return null
    }

    return signal
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
  static checkBollingerBand(bb, closes, emaShort, emaLong, rsi) {
    try {
      if (bb.length < 2) return null
      const lastClose = closes.at(-1)
      const { upper, lower } = bb.at(-1)
      // Đánh giá isStrong cho tín hiệu Bollinger dựa trên việc chạm gần biên
      const isStrong = lastClose <= lower || lastClose >= upper

      // Tín hiệu mua khi giá chạm dải dưới + điều kiện RSI và EMA
      if (lastClose <= lower && rsi < STRATEGY_CONFIG.RSI.OVERSOLD && emaShort.at(-1) > emaLong.at(-1)) {
        return 'BUY'
      }

      // Tín hiệu bán khi giá chạm dải trên + điều kiện RSI và EMA
      if (lastClose >= upper && rsi > STRATEGY_CONFIG.RSI.OVERBOUGHT && emaShort.at(-1) < emaLong.at(-1)) {
        return 'SELL'
      }
      return null
    } catch (error) {
      console.error('Bollinger Band Error:', error)
      return null
    }
  }

  // Chiến lược RSI
  static checkRSI(rsiValues) {
    if (!rsiValues || rsiValues.length < 1) return null

    const currentRSI = rsiValues.at(-1)

    // Thêm điều kiện xu hướng
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

  static calculateMA(values, period) {
    if (values.length < period) return [] // Nếu số lượng giá trị nhỏ hơn chu kỳ, trả về mảng rỗng
    const ma = [] // Khởi tạo một mảng rỗng để lưu trữ các giá trị MA
    for (let i = period - 1; i < values.length; i++) {
      // Bắt đầu vòng lặp từ vị trí mà chúng ta có đủ số lượng giá trị để tính MA
      // Ví dụ: nếu period là 20, vòng lặp bắt đầu từ index 19
      const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
      // Lấy một phần của mảng 'values' có độ dài bằng 'period', bắt đầu từ 'i - period + 1' đến 'i' (bao gồm cả 'i').
      // Sử dụng 'reduce' để tính tổng các giá trị trong phần mảng này.
      ma.push(sum / period) // Tính giá trị trung bình bằng cách chia tổng cho 'period' và thêm vào mảng 'ma'.
    }
    return ma // Trả về mảng chứa các giá trị trung bình động.
  }

  // Chiến lược Volume Spike

  // Chiến lược Volume Spike (đã chỉnh sửa lần 2 - kết hợp nến đảo chiều và ngưỡng volume động)
  static checkVolumeSpike(closes, highs, lows, volumes) {
    if (volumes.length < STRATEGY_CONFIG.VOLUME.PERIOD * 2 || closes.length < 2) return null

    const period = STRATEGY_CONFIG.VOLUME.PERIOD
    const recentVolumes = volumes.slice(-period)
    const avgVolume = recentVolumes.reduce((a, b) => a + b) / period
    const stdDevVolume = Math.sqrt(
      recentVolumes.map((x) => Math.pow(x - avgVolume, 2)).reduce((a, b) => a + b) / period,
    )
    const volumeThreshold = avgVolume + 2 * stdDevVolume // Ngưỡng volume: trung bình + 2 độ lệch chuẩn
    const currentVolume = volumes.at(-1)
    const currentClose = closes.at(-1)
    const prevClose = closes.at(-2)
    const currentHigh = highs.at(-1)
    const currentLow = lows.at(-1)
    const prevHigh = highs.at(-2)
    const prevLow = lows.at(-2)

    if (currentVolume > volumeThreshold) {
      // Kiểm tra nến đảo chiều tăng (Bullish Engulfing hoặc Pin Bar đáy)
      if (currentClose > prevHigh && currentClose > prevClose && currentLow < prevLow) {
        return 'BUY'
      }
      if (
        currentClose > (currentHigh + currentLow) / 2 &&
        currentHigh - currentLow > 2 * Math.abs(currentClose - currentLow) &&
        currentLow < prevLow
      ) {
        return 'BUY' // Pin Bar đáy
      }

      // Kiểm tra nến đảo chiều giảm (Bearish Engulfing hoặc Pin Bar đỉnh)
      if (currentClose < prevLow && currentClose < prevClose && currentHigh > prevHigh) {
        return 'SELL'
      }
      if (
        currentClose < (currentHigh + currentLow) / 2 &&
        currentHigh - currentLow > 2 * Math.abs(currentClose - currentHigh) &&
        currentHigh > prevHigh
      ) {
        return 'SELL' // Pin Bar đỉnh
      }
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

    if (psar.length < 3) return null

    const [prev2, prev1, current] = psar.slice(-3)

    // Xác nhận đảo chiều 2 nến liên tiếp
    const isBuySignal = current > prev1 && prev1 > prev2
    const isSellSignal = current < prev1 && prev1 < prev2

    if (isBuySignal) return 'BUY'
    if (isSellSignal) return 'SELL'
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
