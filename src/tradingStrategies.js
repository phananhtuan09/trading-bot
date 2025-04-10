const { BollingerBands, MACD, EMA, RSI } = require('technicalindicators')
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

  static checkBollingerBand(closes, emaShort, emaLong, rsiArray, volumes) {
    try {
      const bb = BollingerBands.calculate({
        period: STRATEGY_CONFIG.bbPeriod,
        values: closes,
        stdDev: STRATEGY_CONFIG.stdDev,
      })
      if (bb.length < 3) return null

      const [prevBB, currentBB] = bb.slice(-2)
      const [prevClose, lastClose] = closes.slice(-2)
      const [prevVolume, lastVolume] = volumes.slice(-2)
      const [prevRSI, lastRSI] = rsiArray.slice(-2)

      // Tính toán các điều kiện xác nhận
      const avgVolume =
        volumes.slice(-STRATEGY_CONFIG.volumeLookback).reduce((a, b) => a + b, 0) / STRATEGY_CONFIG.volumeLookback

      const bbWidth = (currentBB.upper - currentBB.lower) / currentBB.middle
      const isSqueeze = bbWidth < STRATEGY_CONFIG.bbSqueezeThreshold
      const volumeConfirmed = lastVolume > avgVolume * STRATEGY_CONFIG.riskManagement.volumeMultiplier

      // Điều kiện EMA crossover mới
      const emaCrossUp = emaShort.at(-1) > emaLong.at(-1) && emaShort.at(-2) <= emaLong.at(-2)
      const emaCrossDown = emaShort.at(-1) < emaLong.at(-1) && emaShort.at(-2) >= emaLong.at(-2)

      // Tín hiệu mua cải tiến
      if (
        lastClose > currentBB.lower && // Đóng cửa trên dải dưới hiện tại
        prevClose <= prevBB.lower && // Đã chạm dải dưới trước đó RSI tăng
        lastRSI > prevRSI &&
        lastRSI < STRATEGY_CONFIG.rsiThresholds.oversold + 5 && // Cho phép vùng đáo ngược
        emaCrossUp && // EMA cắt lên mới
        isSqueeze && // Bollinger Band squeeze
        volumeConfirmed // Volume xác nhận
      ) {
        const isStrong = lastRSI < STRATEGY_CONFIG.rsiThresholds.oversold && prevClose < prevBB.lower * 0.998 // Độ sâu của pullback
        return {
          action: 'BUY',
          isStrong,
          confidence: Math.min(100, Math.round(((prevBB.lower - lastClose) / lastClose) * 10000)),
        }
      }

      // Tín hiệu bán cải tiến
      if (
        lastClose < currentBB.upper && // Đóng cửa dưới dải trên hiện tại
        prevClose >= prevBB.upper && // Đã chạm dải trên trước đó RSI giảm
        lastRSI < prevRSI &&
        lastRSI > STRATEGY_CONFIG.rsiThresholds.overbought - 5 && // Vùng đảo chiều
        emaCrossDown && // EMA cắt xuống mới
        isSqueeze && // Bollinger Band squeeze
        volumeConfirmed // Volume xác nhận
      ) {
        const isStrong = lastRSI > STRATEGY_CONFIG.rsiThresholds.overbought && prevClose > prevBB.upper * 1.002 // Độ mạnh của breakout
        return {
          action: 'SELL',
          isStrong,
          confidence: Math.min(100, Math.round(((lastClose - prevBB.upper) / lastClose) * 10000)),
        }
      }

      return null
    } catch (error) {
      console.error('Bollinger Band Error:', error)
      return null
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
