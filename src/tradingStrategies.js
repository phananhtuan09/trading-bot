const { ADX, EMA, RSI, BollingerBands, MACD } = require('technicalindicators')
const { STRATEGY_CONFIG } = require('./config')

class TradingStrategies {
  /**
   * Phân tích thị trường với chiến lược phù hợp
   */
  static analyzeMarket(data, indicators) {
    // 1. Phát hiện loại thị trường
    const marketType = this.detectMarketType(data, indicators)
    
    if (marketType === 'MIXED') {
      return null // Không rõ ràng, bỏ qua
    }
    
    // 2. Áp dụng chiến lược phù hợp
    if (marketType === 'SIDEWAY') {
      return this.analyzeSidewayMarket(data, indicators)
    } else if (marketType === 'TRENDING') {
      return this.analyzeTrendingMarket(data, indicators)
    }
    
    return null
  }
  
  /**
   * Phát hiện loại thị trường
   */
  static detectMarketType(data, indicators) {
    const { adx, ema20, ema50, atr } = indicators
    const currentPrice = data.closes[data.closes.length - 1]
    
    const currentADX = adx[adx.length - 1]
    const currentEMA20 = ema20[ema20.length - 1]
    const currentEMA50 = ema50[ema50.length - 1]
    const currentATR = atr
    
    const emaDistance = Math.abs(currentEMA20 - currentEMA50) / currentPrice * 100
    const atrPercent = (currentATR / currentPrice) * 100
    
    if (currentADX.adx < 25 && emaDistance < 3 && atrPercent < 2) {
      return 'SIDEWAY'
    } else if (currentADX.adx > 25 && emaDistance > 3 && atrPercent > 2) {
      return 'TRENDING'
    } else {
      return 'MIXED'
    }
  }
  
  /**
   * Chiến lược SIDEWAY: Range Trading
   */
  static analyzeSidewayMarket(data, indicators) {
    const currentPrice = data.closes[data.closes.length - 1]
    const { bb, rsi, volumes } = indicators
    
    const currentBB = bb[bb.length - 1]
    const currentRSI = rsi[rsi.length - 1]
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
    const currentVolume = volumes[volumes.length - 1]
    
    // BUY: Bắt đáy range
    const isNearLowerBand = currentPrice <= currentBB.lower * 1.005
    const isRSIOversold = currentRSI < 35
    const isVolumeSpike = currentVolume > avgVolume * 1.5
    
    if (isNearLowerBand && isRSIOversold && isVolumeSpike) {
      return {
        signal: 'BUY',
        strength: this.calculateSidewayStrength(currentRSI, isVolumeSpike),
        reason: `Range Bottom: RSI ${currentRSI.toFixed(1)} + Volume Spike`,
        marketType: 'SIDEWAY'
      }
    }
    
    // SELL: Bắt đỉnh range
    const isNearUpperBand = currentPrice >= currentBB.upper * 0.995
    const isRSIOverbought = currentRSI > 65
    const isVolumeSpike2 = currentVolume > avgVolume * 1.5
    
    if (isNearUpperBand && isRSIOverbought && isVolumeSpike2) {
      return {
        signal: 'SELL',
        strength: this.calculateSidewayStrength(currentRSI, isVolumeSpike2),
        reason: `Range Top: RSI ${currentRSI.toFixed(1)} + Volume Spike`,
        marketType: 'SIDEWAY'
      }
    }
    
    return null
  }
  
  /**
   * Chiến lược TRENDING: Trend Following
   */
  static analyzeTrendingMarket(data, indicators) {
    const currentPrice = data.closes[data.closes.length - 1]
    const { ema20, ema50, macd, adx } = indicators
    
    const currentEMA20 = ema20[ema20.length - 1]
    const currentEMA50 = ema50[ema50.length - 1]
    const currentMACD = macd[macd.length - 1]
    const currentADX = adx[adx.length - 1]
    
    // BUY: Theo xu hướng tăng
    const isBullishTrend = currentEMA20 > currentEMA50
    const isPriceAboveEMA20 = currentPrice > currentEMA20
    const isMACDBullish = currentMACD.MACD > currentMACD.signal
    const isStrongTrend = currentADX.adx > 25
    
    if (isBullishTrend && isPriceAboveEMA20 && isMACDBullish && isStrongTrend) {
      return {
        signal: 'BUY',
        strength: this.calculateTrendingStrength(currentADX.adx, currentMACD.MACD),
        reason: `Trend Following: EMA Bullish + MACD + ADX ${currentADX.adx.toFixed(1)}`,
        marketType: 'TRENDING'
      }
    }
    
    // SELL: Theo xu hướng giảm
    const isBearishTrend = currentEMA20 < currentEMA50
    const isPriceBelowEMA20 = currentPrice < currentEMA20
    const isMACDBearish = currentMACD.MACD < currentMACD.signal
    const isStrongTrend2 = currentADX.adx > 25
    
    if (isBearishTrend && isPriceBelowEMA20 && isMACDBearish && isStrongTrend2) {
      return {
        signal: 'SELL',
        strength: this.calculateTrendingStrength(currentADX.adx, currentMACD.MACD),
        reason: `Trend Following: EMA Bearish + MACD + ADX ${currentADX.adx.toFixed(1)}`,
        marketType: 'TRENDING'
      }
    }
    
    return null
  }
  
  /**
   * Tính độ mạnh cho SIDEWAY
   */
  static calculateSidewayStrength(rsi, volumeSpike) {
    let strength = 0
    
    // RSI càng gần 30/70 = càng mạnh (max 50 điểm)
    const rsiScore = rsi < 50 ? (30 - rsi) * 2 : (rsi - 70) * 2
    strength += Math.min(Math.max(rsiScore, 0), 50)
    
    // Volume spike (30 điểm)
    if (volumeSpike) strength += 30
    
    // Base strength (20 điểm)
    strength += 20
    
    return Math.min(Math.round(strength), 100)
  }
  
  /**
   * Tính độ mạnh cho TRENDING
   */
  static calculateTrendingStrength(adx, macd) {
    let strength = 0
    
    // ADX càng cao = xu hướng càng mạnh (max 50 điểm)
    strength += Math.min(adx, 50)
    
    // MACD momentum (max 30 điểm)
    const macdScore = Math.abs(macd) * 100
    strength += Math.min(macdScore, 30)
    
    // Base strength (20 điểm)
    strength += 20
    
    return Math.min(Math.round(strength), 100)
  }
}

module.exports = TradingStrategies
