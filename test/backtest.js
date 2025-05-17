const { binanceClient } = require('../src/clients')
const { processSignals, filterSignals, calculateTPAndSL, calculateMomentum } = require('../src/dataService') // Loại bỏ các hàm sẽ được định nghĩa lại hoặc không dùng
const TradingStrategies = require('../src/tradingStrategies')
const { RSI, BollingerBands, MACD, EMA, Stochastic, ADX, IchimokuCloud, PSAR } = require('technicalindicators')
const { STRATEGY_CONFIG, ORDER_SETTINGS } = require('../src/config')
const fs = require('fs')
const path = require('path')
const pLimit = require('p-limit')
// const { getSymbols } = require('../src/symbolManager') // Sử dụng symbols từ BACKTEST_SETTINGS
const { getFileNameTimestamp, ensureFoldersExist, log } = require('../src/utils')

const BACKTEST_SETTINGS = {
  symbols: [
    'BTCUSDT',
    'ETHUSDT',
    'BNBUSDT',
    'SOLUSDT',
    'XRPUSDT',
    'ADAUSDT',
    'DOGEUSDT',
    'DOTUSDT',
    'AVAXUSDT',
    'LINKUSDT',
  ],
  interval: STRATEGY_CONFIG.INTERVAL || '15m',
  multiTimeframes: ['1h', '4h', '1d'], // Các khung thời gian phụ cần cho phân tích
  // yearsToTest: 0.5, // Ví dụ: 0.5 năm = 6 tháng, 1 năm, 2 năm
  daysToTest: 30, // Ưu tiên sử dụng daysToTest nếu có. Nếu không, dùng yearsToTest.
  resultFile: 'backtest_results',
  concurrency: 5, // Giảm concurrency để tránh rate limit khi fetch nhiều data
  maxCandlesHold: STRATEGY_CONFIG.MAX_CANDLES_HOLD || 96, // Ví dụ: 96 nến 15m = 24 giờ
}

// --- START: Functions for Backtesting Multi-Timeframe Analysis ---

// Copy calculateATR từ dataService.js để làm cho backtest.js độc lập hơn
function calculateATRForBacktest(highs, lows, closes, period = STRATEGY_CONFIG.ATR.PERIOD) {
  if (highs.length < period || lows.length < period || closes.length < period) {
    // log('warn', `Không đủ dữ liệu để tính ATR ${period} kỳ. Có ${highs.length} nến.`);
    return [] // Trả về mảng rỗng nếu không đủ dữ liệu
  }
  const tr = []
  for (let i = 1; i < highs.length; i++) {
    if (closes[i - 1] == null) {
      // Kiểm tra nếu giá trị trước đó là null (có thể xảy ra ở đầu mảng)
      // log('warn', `Giá đóng cửa trước đó là null tại index ${i-1} khi tính TR cho ATR.`);
      if (tr.length === 0 && i < period) continue // Bỏ qua nếu ở đầu và chưa đủ cho kỳ ATR
      // Nếu không thể tính TR, có thể push một giá trị placeholder hoặc xử lý khác
      // Tạm thời push 0 để mảng atr có cùng độ dài, nhưng giá trị này sẽ không chính xác
      tr.push(0)
      continue
    }
    const highLow = highs[i] - lows[i]
    const highPrevClose = Math.abs(highs[i] - closes[i - 1])
    const lowPrevClose = Math.abs(lows[i] - closes[i - 1])
    tr.push(Math.max(highLow, highPrevClose, lowPrevClose))
  }

  if (tr.length < period) {
    // log('warn', `Không đủ True Range (${tr.length}) để tính ATR ${period} kỳ.`);
    return []
  }

  const atr = []
  // Tính SMA cho ATR đầu tiên
  let sumTR = 0
  for (let i = 0; i < period; i++) {
    sumTR += tr[i]
  }
  atr.push(sumTR / period)

  // Tính các ATR tiếp theo bằng công thức Wilder's smoothing
  for (let i = period; i < tr.length; i++) {
    const smoothedATR = (atr[atr.length - 1] * (period - 1) + tr[i]) / period
    atr.push(smoothedATR)
  }
  return atr
}

/**
 * Lấy một phần dữ liệu lịch sử cho một khung thời gian cụ thể, kết thúc tại currentCandleTime.
 * Dữ liệu này được lấy từ một tập dữ liệu lớn hơn đã được fetch trước đó.
 * @param {Array} allCandlesForSpecificInterval - Mảng tất cả các nến đã fetch cho khung thời gian này.
 * @param {number} currentCandleTimeOnMainInterval - Timestamp của nến hiện tại trên khung thời gian chính.
 * @param {number} limit - Số lượng nến cần lấy (ví dụ 100).
 * @returns {object} Dữ liệu nến (closes, highs, lows, volumes).
 */
function getHistoricalDataForBacktest(allCandlesForSpecificInterval, currentCandleTimeOnMainInterval, limit = 200) {
  if (!allCandlesForSpecificInterval || allCandlesForSpecificInterval.length === 0) {
    return { symbol: '', closes: [], highs: [], lows: [], volumes: [], openTimes: [] }
  }

  // Tìm nến cuối cùng trên khung thời gian này có openTime <= currentCandleTimeOnMainInterval
  // Điều này đảm bảo chúng ta chỉ sử dụng dữ liệu quá khứ (hoặc bằng) của nến hiện tại trên interval chính
  let endIndex = -1
  for (let i = allCandlesForSpecificInterval.length - 1; i >= 0; i--) {
    if (allCandlesForSpecificInterval[i].time <= currentCandleTimeOnMainInterval) {
      endIndex = i
      break
    }
  }

  if (endIndex === -1) {
    // Không có nến nào trước hoặc bằng thời gian hiện tại
    return { symbol: '', closes: [], highs: [], lows: [], volumes: [], openTimes: [] }
  }

  const relevantCandles = allCandlesForSpecificInterval.slice(0, endIndex + 1)
  const startIndex = Math.max(0, relevantCandles.length - limit)
  const candles = relevantCandles.slice(startIndex)

  return {
    symbol: candles.length > 0 ? candles[0].symbol : '',
    closes: candles.map((c) => parseFloat(c.close)),
    highs: candles.map((c) => parseFloat(c.high)),
    lows: candles.map((c) => parseFloat(c.low)),
    volumes: candles.map((c) => parseFloat(c.volume)),
    openTimes: candles.map((c) => c.time), // Hữu ích cho việc debug
  }
}

/**
 * Phân tích một khung thời gian cụ thể sử dụng dữ liệu lịch sử đã được tải trước.
 * @param {Array} historicalDataForSpecificInterval - Mảng tất cả các nến đã fetch cho khung thời gian này.
 * @param {number} currentCandleTimeOnMainInterval - Timestamp của nến hiện tại trên khung thời gian chính.
 * @param {string} intervalName - Tên của khung thời gian (ví dụ: '1h').
 * @returns {object} Chứa mảng EMA và ATR.
 */
function analyzeTimeframeForBacktest(historicalDataForSpecificInterval, currentCandleTimeOnMainInterval, intervalName) {
  // Cần lấy đủ nến để tính chỉ báo dài nhất, ví dụ EMA period + số nến ATR period
  const requiredCandles = Math.max(
    STRATEGY_CONFIG.FILTER.MULTI_TIMEFRAME_EMA.LONG + (STRATEGY_CONFIG.ATR.PERIOD || 14), // Đảm bảo có STRATEGY_CONFIG.ATR.period
    STRATEGY_CONFIG.ATR.PERIOD + 50, // Thêm một buffer cho ATR
  )

  const data = getHistoricalDataForBacktest(
    historicalDataForSpecificInterval,
    currentCandleTimeOnMainInterval,
    requiredCandles + 50,
  ) // +50 buffer

  if (!data || data.closes.length < STRATEGY_CONFIG.FILTER.MULTI_TIMEFRAME_EMA.LONG) {
    // log('warn', `(${intervalName}) Không đủ dữ liệu (${data.closes.length}) tại ${new Date(currentCandleTimeOnMainInterval).toISOString()} để tính EMA ${STRATEGY_CONFIG.FILTER.MULTI_TIMEFRAME_EMA.LONG} kỳ.`);
    return { ema: [], atr: [], lastEma: null, lastAtr: null }
  }

  const emaValues = EMA.calculate({
    period: STRATEGY_CONFIG.FILTER.MULTI_TIMEFRAME_EMA.LONG,
    values: data.closes,
  })

  const atrValues = calculateATRForBacktest(data.highs, data.lows, data.closes, STRATEGY_CONFIG.ATR.PERIOD)

  return {
    ema: emaValues, // Mảng các giá trị EMA
    atr: atrValues, // Mảng các giá trị ATR
    lastEma: emaValues.length > 0 ? emaValues[emaValues.length - 1] : null,
    lastAtr: atrValues.length > 0 ? atrValues[atrValues.length - 1] : null,
  }
}

// --- END: Functions for Backtesting Multi-Timeframe Analysis ---

async function fetchAllCandlesForSymbol(symbol, interval, startTime, endTime) {
  let allCandles = []
  let currentStart = startTime
  const maxRetries = 3
  const retryDelay = 3000 // ms

  log(
    'log',
    `Workspaceing ${symbol} ${interval} from ${new Date(startTime).toISOString()} to ${new Date(
      endTime,
    ).toISOString()}`,
  )

  while (currentStart < endTime) {
    let attempts = 0
    let success = false
    let candles

    while (attempts < maxRetries && !success) {
      try {
        candles = await binanceClient.futuresCandles({
          symbol: symbol,
          interval: interval,
          startTime: currentStart,
          endTime: endTime, // Binance API cho phép endTime
          limit: 1000, // Max limit có thể là 1500 tùy endpoint và loại account
        })
        success = true
      } catch (error) {
        attempts++
        log(
          'warn',
          `(Attempt ${attempts}/${maxRetries}) Lỗi khi fetch ${symbol} ${interval}: ${error.message}. Retrying in ${
            retryDelay / 1000
          }s...`,
        )
        if (attempts >= maxRetries) {
          log('error', `Workspace failed cho ${symbol} ${interval} sau ${maxRetries} lần thử.`)
          throw error // Ném lỗi ra ngoài để processSymbol bắt được
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay * attempts)) // Exponential backoff nhẹ
      }
    }

    if (!candles || candles.length === 0) {
      break // Không còn nến nào hoặc lỗi không bắt được
    }
    allCandles = allCandles.concat(candles)
    currentStart = candles[candles.length - 1].closeTime + 1

    // Binance rate limit: Thêm delay nhỏ giữa các lần gọi
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  log('log', `Workspaceed ${allCandles.length} candles cho ${symbol} ${interval}`)
  return allCandles.map((c) => ({
    // Map về format chuẩn của backtest
    symbol,
    time: c.openTime,
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
    volume: parseFloat(c.volume),
  }))
}

async function processSymbol(symbol, overallStartTime, overallEndTime) {
  // Nhận startTime, endTime tổng thể
  try {
    log(
      'log',
      `🔄 Đang xử lý ${symbol} từ ${new Date(overallStartTime).toISOString()} đến ${new Date(
        overallEndTime,
      ).toISOString()}`,
    )

    // Tải dữ liệu cho khung thời gian chính
    const mainIntervalData = await fetchAllCandlesForSymbol(
      symbol,
      BACKTEST_SETTINGS.interval,
      overallStartTime,
      overallEndTime,
    )

    if (
      !mainIntervalData ||
      mainIntervalData.length < (STRATEGY_CONFIG.MIN_CANDLES_FOR_ANALYSIS || 200) + BACKTEST_SETTINGS.maxCandlesHold
    ) {
      log(
        'warn',
        `⚠️ Không đủ dữ liệu (${mainIntervalData ? mainIntervalData.length : 0}) cho interval chính ${
          BACKTEST_SETTINGS.interval
        } của ${symbol}. Cần ít nhất ${
          (STRATEGY_CONFIG.MIN_CANDLES_FOR_ANALYSIS || 200) + BACKTEST_SETTINGS.maxCandlesHold
        }.`,
      )
      return []
    }

    // Tải dữ liệu cho các khung thời gian phụ
    const multiTimeframeCandleData = {}
    for (const tf of BACKTEST_SETTINGS.multiTimeframes) {
      multiTimeframeCandleData[tf] = await fetchAllCandlesForSymbol(symbol, tf, overallStartTime, overallEndTime)
      if (!multiTimeframeCandleData[tf] || multiTimeframeCandleData[tf].length === 0) {
        log('warn', `⚠️ Không có dữ liệu cho timeframe phụ ${tf} của ${symbol}. Phân tích MFT có thể không chính xác.`)
      }
    }

    const results = []
    const minCandlesForAnalysis = STRATEGY_CONFIG.MIN_CANDLES_FOR_ANALYSIS || 200 // Số nến tối thiểu để tính chỉ báo ban đầu

    for (let i = minCandlesForAnalysis - 1; i < mainIntervalData.length - BACKTEST_SETTINGS.maxCandlesHold; i++) {
      const currentCandleOnMainInterval = mainIntervalData[i]
      const currentCandleTime = currentCandleOnMainInterval.time

      // Dữ liệu để tính chỉ báo trên khung thời gian chính, kết thúc tại nến i
      const analysisChunk = mainIntervalData.slice(0, i + 1)
      const closes = analysisChunk.map((c) => c.close)
      const highs = analysisChunk.map((c) => c.high)
      const lows = analysisChunk.map((c) => c.low)
      const volumes = analysisChunk.map((c) => c.volume)

      if (closes.length < minCandlesForAnalysis) continue // Đảm bảo đủ nến cho slice này

      const atrValues = calculateATRForBacktest(highs, lows, closes, STRATEGY_CONFIG.ATR.PERIOD) // Sử dụng hàm backtest
      const currentATR = atrValues.length > 0 ? atrValues[atrValues.length - 1] : 0
      const entryPrice = currentCandleOnMainInterval.close // Giá vào lệnh là giá đóng cửa của nến tín hiệu (nến i)
      const volatility = currentATR && entryPrice ? (currentATR / entryPrice) * 100 : 0

      const indicators = {
        // Các chỉ báo trên khung thời gian chính
        bb: BollingerBands.calculate({
          period: STRATEGY_CONFIG.BOLLINGER_BAND.PERIOD,
          values: closes,
          stdDev: STRATEGY_CONFIG.BOLLINGER_BAND.STD_DEV,
        }),
        rsi: RSI.calculate({ values: closes, period: STRATEGY_CONFIG.RSI.PERIOD }),
        macd: MACD.calculate({
          values: closes,
          fastPeriod: STRATEGY_CONFIG.MACD.FAST_PERIOD,
          slowPeriod: STRATEGY_CONFIG.MACD.SLOW_PERIOD,
          signalPeriod: STRATEGY_CONFIG.MACD.SIGNAL_PERIOD,
        }),
        stochastic: Stochastic.calculate({
          high: highs,
          low: lows,
          close: closes,
          period: STRATEGY_CONFIG.STOCHASTIC.PERIOD,
          signalPeriod: STRATEGY_CONFIG.STOCHASTIC.SIGNAL_PERIOD,
        }),
        adx: ADX.calculate({ high: highs, low: lows, close: closes, period: STRATEGY_CONFIG.ADX.PERIOD }),
        ichimoku: IchimokuCloud.calculate({
          high: highs,
          low: lows,
          conversionPeriod: STRATEGY_CONFIG.ICHIMOKU.CONVERSION_PERIOD,
          basePeriod: STRATEGY_CONFIG.ICHIMOKU.BASE_PERIOD,
          spanPeriod: STRATEGY_CONFIG.ICHIMOKU.SPAN_PERIOD,
        }),
        psar: PSAR.calculate({
          high: highs,
          low: lows,
          step: STRATEGY_CONFIG.PSAR.STEP,
          max: STRATEGY_CONFIG.PSAR.MAX,
        }),
        momentum: calculateMomentum(closes, STRATEGY_CONFIG.MOMENTUM.PERIOD),
        atr: currentATR,
        volatility: volatility,
      }

      const emaShort = EMA.calculate({ period: STRATEGY_CONFIG.EMA_PERIODS.SHORT, values: closes })
      const emaLong = EMA.calculate({ period: STRATEGY_CONFIG.EMA_PERIODS.LONG, values: closes })

      // Phân tích đa khung thời gian sử dụng dữ liệu đã fetch và hàm backtest-specific
      const multiTimeframeAnalysis = {}
      for (const tf of BACKTEST_SETTINGS.multiTimeframes) {
        multiTimeframeAnalysis[tf] = analyzeTimeframeForBacktest(multiTimeframeCandleData[tf], currentCandleTime, tf)
      }

      const allStrategies = {
        RSI: TradingStrategies.checkRSI(indicators.rsi),
        MACD: TradingStrategies.checkMACD(indicators.macd),
        SMA: TradingStrategies.checkSMA(emaShort, emaLong), // emaShort và emaLong là mảng
        Stochastic: TradingStrategies.checkStochastic(indicators.stochastic),
        BollingerBands: TradingStrategies.checkBollingerBands(indicators.bb, closes), // indicators.bb là mảng object, closes là mảng giá
        ADX: TradingStrategies.checkADX(indicators.adx),
        Ichimoku: TradingStrategies.checkIchimoku(indicators.ichimoku, entryPrice, highs, lows), // entryPrice là giá hiện tại
        PSAR: TradingStrategies.checkPSAR(indicators.psar, entryPrice),
        Momentum: TradingStrategies.checkMomentum(indicators.momentum),
      }

      const filteredStrategies = filterSignals(
        allStrategies,
        { highs, lows, closes, volumes, currentPrice: entryPrice }, // Truyền currentPrice vào data cho filterSignals
        indicators, // indicators này chứa giá trị cuối của các chỉ báo (hoặc mảng)
        multiTimeframeAnalysis, // multiTimeframeAnalysis chứa {ema: [...], atr: [...], lastEma: value, lastAtr: value}
      )

      if (filteredStrategies === null) continue

      const processed = processSignals(filteredStrategies)
      if (processed === null) continue

      // Sử dụng entryPrice (giá đóng cửa của nến i) để tính TP/SL
      const { TP_ROI, SL_ROI } = calculateTPAndSL(processed.decision, entryPrice, indicators)

      if (parseFloat(TP_ROI) < (STRATEGY_CONFIG.MIN_TP_ROI_PERCENT || 1.5)) continue // Lọc tín hiệu có TP quá thấp

      const tpPrice =
        processed.decision === 'Long'
          ? entryPrice * (1 + parseFloat(TP_ROI) / 100)
          : entryPrice * (1 - parseFloat(TP_ROI) / 100)
      const slPrice =
        processed.decision === 'Long'
          ? entryPrice * (1 + parseFloat(SL_ROI) / 100)
          : entryPrice * (1 - parseFloat(SL_ROI) / 100)

      const result = {
        symbol,
        date: new Date(currentCandleTime).toISOString(),
        action: processed.decision,
        entryPrice: entryPrice,
        strategies: [],
        TP_ROI: parseFloat(TP_ROI),
        SL_ROI: parseFloat(SL_ROI),
        tpPrice,
        slPrice,
        initialMargin: ORDER_SETTINGS.QUANTITY,
        isHitTp: false,
        isHitSL: false,
        actual_ROI: 0,
        closePrice: entryPrice, // Sẽ cập nhật khi lệnh đóng
        closeMargin: ORDER_SETTINGS.QUANTITY, // Sẽ cập nhật
        reasonClose: `timeout${BACKTEST_SETTINGS.maxCandlesHold}Candles`,
        strength: processed.strengthCount,
        hitTimeCandles: null,
        closeDate: null,
      }

      const contributingStrategies = []
      Object.values(processed.futuresDetails).forEach((group) => {
        if (group.direction === processed.decision) {
          contributingStrategies.push(...group.contributors)
        }
      })
      result.strategies = [...new Set(contributingStrategies)].sort().join('_')

      for (let k = 1; k <= BACKTEST_SETTINGS.maxCandlesHold; k++) {
        const futureCandleIndex = i + k
        if (futureCandleIndex >= mainIntervalData.length) {
          result.reasonClose = 'endOfData'
          result.closePrice = mainIntervalData[mainIntervalData.length - 1].close
          result.hitTimeCandles = k - 1
          result.closeDate = new Date(mainIntervalData[mainIntervalData.length - 1].time).toISOString()
          const directionMultiplier = result.action === 'Long' ? 1 : -1
          result.actual_ROI = directionMultiplier * ((result.closePrice - result.entryPrice) / result.entryPrice) * 100
          break
        }

        const futureCandle = mainIntervalData[futureCandleIndex]
        const candleHighPrice = futureCandle.high // Giá cao nhất của nến tương lai
        const candleLowPrice = futureCandle.low // Giá thấp nhất của nến tương lai
        result.hitTimeCandles = k
        result.closeDate = new Date(futureCandle.time).toISOString()

        let breakLoop = false
        if (result.action === 'Long') {
          // Ưu tiên kiểm tra SL trước nếu giá trong nến chạm cả SL và TP (hiếm nhưng có thể)
          if (candleLowPrice <= slPrice) {
            result.isHitSL = true
            result.reasonClose = 'hitSL'
            result.closePrice = slPrice
            result.actual_ROI = result.SL_ROI
            breakLoop = true
          } else if (candleHighPrice >= tpPrice) {
            result.isHitTp = true
            result.reasonClose = 'hitTP'
            result.closePrice = tpPrice
            result.actual_ROI = result.TP_ROI
            breakLoop = true
          }
        } else {
          // Short
          if (candleHighPrice >= slPrice) {
            result.isHitSL = true
            result.reasonClose = 'hitSL'
            result.closePrice = slPrice
            result.actual_ROI = result.SL_ROI
            breakLoop = true
          } else if (candleLowPrice <= tpPrice) {
            result.isHitTp = true
            result.reasonClose = 'hitTP'
            result.closePrice = tpPrice
            result.actual_ROI = result.TP_ROI
            breakLoop = true
          }
        }
        if (breakLoop) break

        if (k === BACKTEST_SETTINGS.maxCandlesHold) {
          // Nếu là nến cuối cùng trong thời gian giữ lệnh
          result.closePrice = futureCandle.close
          const directionMultiplier = result.action === 'Long' ? 1 : -1
          result.actual_ROI = directionMultiplier * ((result.closePrice - result.entryPrice) / result.entryPrice) * 100
        }
      }

      const initialMargin = ORDER_SETTINGS.QUANTITY
      const leverage = ORDER_SETTINGS.LEVERAGE || 1 // Mặc định đòn bẩy là 1 nếu không có
      const quantity = (initialMargin * leverage) / result.entryPrice
      // PnL được tính dựa trên actual_ROI để nhất quán, vì actual_ROI đã bao gồm % thay đổi giá
      // PnL = Vốn ban đầu * (actual_ROI / 100) * Đòn bẩy (nếu actual_ROI chưa nhân đòn bẩy)
      // Hoặc: (Giá đóng - Giá vào) * Số lượng * Hướng lệnh
      // actual_ROI đã là % PnL trên vốn ban đầu trước đòn bẩy (nếu TP_ROI, SL_ROI tính theo giá)
      // Vậy PnL thực tế trên vốn ký quỹ = initialMargin * (actual_ROI / 100)
      const pnl = initialMargin * (result.actual_ROI / 100)
      result.closeMargin = initialMargin + pnl

      result.actual_ROI = parseFloat(result.actual_ROI.toFixed(2))
      result.closeMargin = parseFloat(result.closeMargin.toFixed(2))
      results.push(result)
    }
    return results
  } catch (error) {
    log('error', `❌ Lỗi nghiêm trọng với ${symbol}:`, error.message)
    log('error', error.stack) // Log stack trace để debug dễ hơn
    return [] // Trả về mảng rỗng nếu có lỗi không phục hồi được
  }
}

async function runBacktest() {
  try {
    const symbolsToTest = BACKTEST_SETTINGS.symbols
    const limit = pLimit(BACKTEST_SETTINGS.concurrency)
    if (symbolsToTest.length === 0) {
      log('warn', '⚠️ Không có symbol nào để xử lý trong BACKTEST_SETTINGS.')
      return
    }

    log('log', `Chuẩn bị xử lý ${symbolsToTest.length} symbol.`)

    const overallEndTime = Date.now() // Thời điểm kết thúc backtest là hiện tại
    let overallStartTime
    if (BACKTEST_SETTINGS.daysToTest) {
      overallStartTime = overallEndTime - BACKTEST_SETTINGS.daysToTest * 24 * 60 * 60 * 1000
    } else if (BACKTEST_SETTINGS.yearsToTest) {
      overallStartTime = overallEndTime - BACKTEST_SETTINGS.yearsToTest * 365.25 * 24 * 60 * 60 * 1000
    } else {
      overallStartTime = overallEndTime - 30 * 24 * 60 * 60 * 1000 // Mặc định 30 ngày
      log('warn', 'Không có daysToTest hoặc yearsToTest. Mặc định backtest 30 ngày.')
    }

    log(
      'log',
      `Khoảng thời gian Backtest: ${new Date(overallStartTime).toISOString()} to ${new Date(
        overallEndTime,
      ).toISOString()}`,
    )

    const tasks = symbolsToTest.map((symbol) => limit(() => processSymbol(symbol, overallStartTime, overallEndTime)))
    const allResultsNested = await Promise.all(tasks)
    const mergedResults = allResultsNested.flat()

    if (mergedResults.length === 0) {
      log('warn', '⚠️ Không có kết quả nào từ backtest để ghi lại.')
      return
    }

    ensureFoldersExist(['logs/backtest'])
    const outputPath = path.join(
      __dirname,
      '..',
      'logs',
      'backtest',
      getFileNameTimestamp(BACKTEST_SETTINGS.resultFile),
    )
    fs.writeFileSync(outputPath, JSON.stringify(mergedResults, null, 2))
    log(
      'info',
      `✅ Đã xử lý ${symbolsToTest.length} coins. Kết quả (${mergedResults.length} trades) lưu tại: ${outputPath}`,
    )
  } catch (error) {
    log('error', '❌ Lỗi tổng trong runBacktest:', error.message)
    log('error', error.stack)
  }
}

runBacktest()
