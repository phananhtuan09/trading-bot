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

  // static checkBollingerBand(closes, emaShort, emaLong, rsiArray, volumes) {
  //   try {
  //     const bb = BollingerBands.calculate({
  //       period: STRATEGY_CONFIG.bbPeriod,
  //       values: closes,
  //       stdDev: STRATEGY_CONFIG.stdDev,
  //     })
  //     if (bb.length < 3) return null

  //     const [prevBB, currentBB] = bb.slice(-2)
  //     const [prevClose, lastClose] = closes.slice(-2)
  //     const [prevVolume, lastVolume] = volumes.slice(-2)
  //     const [prevRSI, lastRSI] = rsiArray.slice(-2)

  //     // Tính toán các điều kiện xác nhận
  //     const avgVolume =
  //       volumes.slice(-STRATEGY_CONFIG.volumeLookback).reduce((a, b) => a + b, 0) / STRATEGY_CONFIG.volumeLookback

  //     const bbWidth = (currentBB.upper - currentBB.lower) / currentBB.middle
  //     const isSqueeze = bbWidth < STRATEGY_CONFIG.bbSqueezeThreshold
  //     const volumeConfirmed = lastVolume > avgVolume * STRATEGY_CONFIG.riskManagement.volumeMultiplier

  //     // Điều kiện EMA crossover mới
  //     const emaCrossUp = emaShort.at(-1) > emaLong.at(-1) && emaShort.at(-2) <= emaLong.at(-2)
  //     const emaCrossDown = emaShort.at(-1) < emaLong.at(-1) && emaShort.at(-2) >= emaLong.at(-2)

  //     // Tín hiệu mua cải tiến
  //     if (
  //       lastClose > currentBB.lower && // Đóng cửa trên dải dưới hiện tại
  //       prevClose <= prevBB.lower && // Đã chạm dải dưới trước đó RSI tăng
  //       lastRSI > prevRSI &&
  //       lastRSI < STRATEGY_CONFIG.rsiThresholds.oversold + 5 && // Cho phép vùng đáo ngược
  //       emaCrossUp && // EMA cắt lên mới
  //       isSqueeze && // Bollinger Band squeeze
  //       volumeConfirmed // Volume xác nhận
  //     ) {
  //       const isStrong = lastRSI < STRATEGY_CONFIG.rsiThresholds.oversold && prevClose < prevBB.lower * 0.998 // Độ sâu của pullback
  //       return {
  //         action: 'BUY',
  //         isStrong,
  //         confidence: Math.min(100, Math.round(((prevBB.lower - lastClose) / lastClose) * 10000)),
  //       }
  //     }

  //     // Tín hiệu bán cải tiến
  //     if (
  //       lastClose < currentBB.upper && // Đóng cửa dưới dải trên hiện tại
  //       prevClose >= prevBB.upper && // Đã chạm dải trên trước đó RSI giảm
  //       lastRSI < prevRSI &&
  //       lastRSI > STRATEGY_CONFIG.rsiThresholds.overbought - 5 && // Vùng đảo chiều
  //       emaCrossDown && // EMA cắt xuống mới
  //       isSqueeze && // Bollinger Band squeeze
  //       volumeConfirmed // Volume xác nhận
  //     ) {
  //       const isStrong = lastRSI > STRATEGY_CONFIG.rsiThresholds.overbought && prevClose > prevBB.upper * 1.002 // Độ mạnh của breakout
  //       return {
  //         action: 'SELL',
  //         isStrong,
  //         confidence: Math.min(100, Math.round(((lastClose - prevBB.upper) / lastClose) * 10000)),
  //       }
  //     }

  //     return null
  //   } catch (error) {
  //     console.error('Bollinger Band Error:', error)
  //     return null
  //   }
  // }

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

  static getDynamicBBParams(volatility) {
    return {
      period: 20, // Cố định period
      stdDev: 2.0, // Giảm stdDev
    }
  }

  static volumeFilter(currentVolume, volumeMA) {
    return currentVolume > volumeMA * 1.1 // Giảm ngưỡng volume
  }

  static momentumFilter(prices) {
    if (prices.length < 6) return false
    const momentum = (prices[prices.length - 1] / prices[prices.length - 6] - 1) * 100
    return momentum > -2 && momentum < 5
  }

  static checkRSIDivergence(prices, rsi) {
    if (prices.length < 10 || rsi.length < 10) return null

    // Phát hiện phân kỳ giá-RSI
    const priceTrend = prices.slice(-3).map((p) => p - prices[prices.length - 4])
    const rsiTrend = rsi.slice(-3).map((r) => r - rsi[rsi.length - 4])

    if (priceTrend[2] > priceTrend[1] && rsiTrend[2] < rsiTrend[1]) {
      return 'bearish'
    }
    if (priceTrend[2] < priceTrend[1] && rsiTrend[2] > rsiTrend[1]) {
      return 'bullish'
    }
    return null
  }

  // static checkBollingerBand(closes, highs, lows, volumes, emaShort, emaLong, rsi) {
  //   try {
  //     // Tính toán volatility
  //     const atr = ATR.calculate({
  //       period: 14,
  //       high: highs.slice(-15),
  //       low: lows.slice(-15),
  //       close: closes.slice(-15),
  //     })

  //     const volatility = atr.length > 0 ? atr[atr.length - 1] / closes[closes.length - 1] : 0

  //     // Điều chỉnh tham số động
  //     const bbParams = this.getDynamicBBParams(volatility)
  //     const bb = BollingerBands.calculate({
  //       period: bbParams.period,
  //       values: closes,
  //       stdDev: bbParams.stdDev,
  //     })

  //     if (bb.length < 2) return null

  //     // Các điều kiện phụ trợ
  //     const volumeMA = SMA.calculate({
  //       period: 20,
  //       values: volumes,
  //     })

  //     const lastClose = closes[closes.length - 1]
  //     const isTrendConfirmed = emaShort[emaShort.length - 1] > emaLong[emaLong.length - 1]
  //     const currentVolume = volumes[volumes.length - 1]
  //     const validVolume = this.volumeFilter(currentVolume, volumeMA[volumeMA.length - 1] || 0)
  //     const rsiDivergence = this.checkRSIDivergence(closes, rsi)
  //     const momentumOK = this.momentumFilter(closes.slice(-6))

  //     // Tín hiệu mua
  //     if (
  //       lastClose < bb[bb.length - 1].lower &&
  //       rsi[rsi.length - 1] < 38 &&
  //       validVolume &&
  //       isTrendConfirmed &&
  //       rsiDivergence === 'bullish' &&
  //       momentumOK
  //     ) {
  //       return {
  //         action: 'BUY',
  //         isStrong: lastClose < bb[bb.length - 1].lower * 0.99,
  //         atr: atr[atr.length - 1] || 0,
  //       }
  //     }

  //     // Tín hiệu bán
  //     if (
  //       lastClose > bb[bb.length - 1].upper &&
  //       rsi[rsi.length - 1] > 62 &&
  //       validVolume &&
  //       !isTrendConfirmed &&
  //       rsiDivergence === 'bearish' &&
  //       momentumOK
  //     ) {
  //       return {
  //         action: 'SELL',
  //         isStrong: lastClose > bb[bb.length - 1].upper * 1.01,
  //         atr: atr[atr.length - 1] || 0,
  //       }
  //     }

  //     return null
  //   } catch (error) {
  //     console.error('Bollinger Band Error:', error)
  //     return null
  //   }
  // }

  static checkBollingerBand(closes, emaShort, emaLong, rsi, volumes) {
    try {
      const bb = BollingerBands.calculate({
        period: STRATEGY_CONFIG.bbPeriod,
        values: closes,
        stdDev: STRATEGY_CONFIG.stdDev,
      });
      if (bb.length < 2) return null;
  
      const lastClose = closes.at(-1);
      const { upper, lower } = bb.at(-1);
  
      // Tính trung bình khối lượng
      const volumeMA = EMA.calculate({
        period: 20,
        values: volumes,
      });
      const lastVolume = volumes.at(-1);
      const isHighVolume = lastVolume > volumeMA.at(-1);
  
      // Đánh giá tín hiệu mạnh
      const isStrong = (lastClose <= lower || lastClose >= upper) && isHighVolume;
  
      // Tín hiệu mua
      if (
        lastClose <= lower &&
        rsi < 25 && // RSI chặt hơn
        emaShort.at(-1) > emaLong.at(-1) &&
        isHighVolume
      ) {
        return { action: 'BUY', isStrong };
      }
  
      // Tín hiệu bán
      if (
        lastClose >= upper &&
        rsi > 75 && // RSI chặt hơn
        emaShort.at(-1) < emaLong.at(-1) &&
        isHighVolume
      ) {
        return { action: 'SELL', isStrong };
      }
      return null;
    } catch (error) {
      console.error('Bollinger Band Error:', error);
      return null;
    }
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
