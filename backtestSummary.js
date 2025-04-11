const fs = require('fs')
const path = require('path')

const INPUT_FILE = path.join(__dirname, 'test', 'backtest_results.json')
const OUTPUT_FILE = path.join(__dirname, 'test', 'backtest_summary.json')

function generateSummary() {
  try {
    const rawData = fs.readFileSync(INPUT_FILE)
    const results = JSON.parse(rawData)

    const strategyStats = {}
    const timeIntervals = ['1h', '4h', '8h', '12h', '24h']

    // Khởi tạo cấu trúc dữ liệu
    results.forEach((entry) => {
      const strategy = entry.strategy
      const symbol = entry.symbol

      if (!strategyStats[strategy]) {
        strategyStats[strategy] = {
          totalSignals: 0,
          symbols: {},
          timeStats: {},
          allPositiveSignals: 0,
          bestInterval: null,
        }

        timeIntervals.forEach((interval) => {
          strategyStats[strategy].timeStats[interval] = {
            count: 0,
            profits: [],
            rois: [],
            maxProfit: -Infinity,
            minProfit: Infinity,
            avgProfit: 0,
            maxROI: -Infinity,
            minROI: Infinity,
            avgROI: 0,
          }
        })
      }

      // Khởi tạo dữ liệu symbol
      if (!strategyStats[strategy].symbols[symbol]) {
        strategyStats[strategy].symbols[symbol] = {
          totalSignals: 0,
          timeStats: {},
          allPositiveSignals: 0,
          bestInterval: null,
        }

        timeIntervals.forEach((interval) => {
          strategyStats[strategy].symbols[symbol].timeStats[interval] = {
            count: 0,
            profits: [],
            rois: [],
            maxProfit: -Infinity,
            minProfit: Infinity,
            avgProfit: 0,
            maxROI: -Infinity,
            minROI: Infinity,
            avgROI: 0,
          }
        })
      }

      strategyStats[strategy].totalSignals++
      strategyStats[strategy].symbols[symbol].totalSignals++

      let allPositiveGlobal = true
      let allPositiveSymbol = true

      // Xử lý từng khung giờ
      timeIntervals.forEach((interval) => {
        const data = entry[`after${interval.replace('h', '')}h`]
        if (data && data.profitPercent && data.roi) {
          const profit = parseFloat(data.profitPercent)
          const roi = parseFloat(data.roi)

          if (!isNaN(profit)) {
            // Cập nhật global stats
            const globalStats = strategyStats[strategy].timeStats[interval]
            globalStats.count++
            globalStats.profits.push(profit)
            globalStats.rois.push(roi)
            globalStats.maxProfit = Math.max(globalStats.maxProfit, profit)
            globalStats.minProfit = Math.min(globalStats.minProfit, profit)
            globalStats.maxROI = Math.max(globalStats.maxROI, roi)
            globalStats.minROI = Math.min(globalStats.minROI, roi)

            // Cập nhật symbol stats
            const symbolStats = strategyStats[strategy].symbols[symbol].timeStats[interval]
            symbolStats.count++
            symbolStats.profits.push(profit)
            symbolStats.rois.push(roi)
            symbolStats.maxProfit = Math.max(symbolStats.maxProfit, profit)
            symbolStats.minProfit = Math.min(symbolStats.minProfit, profit)
            symbolStats.maxROI = Math.max(symbolStats.maxROI, roi)
            symbolStats.minROI = Math.min(symbolStats.minROI, roi)

            if (profit <= 0) {
              allPositiveGlobal = false
              allPositiveSymbol = false
            }
          }
        }
      })

      if (allPositiveGlobal) strategyStats[strategy].allPositiveSignals++
      if (allPositiveSymbol) strategyStats[strategy].symbols[symbol].allPositiveSignals++
    })

    // Tính toán các giá trị trung bình
    Object.keys(strategyStats).forEach((strategy) => {
      let bestAvgGlobal = -Infinity
      const strategyData = strategyStats[strategy]

      // Xử lý global stats
      timeIntervals.forEach((interval) => {
        const stats = strategyData.timeStats[interval]
        if (stats.profits.length > 0) {
          stats.avgProfit = stats.profits.reduce((a, b) => a + b, 0) / stats.profits.length
          stats.avgROI = stats.rois.reduce((a, b) => a + b, 0) / stats.rois.length

          if (stats.avgProfit > bestAvgGlobal) {
            bestAvgGlobal = stats.avgProfit
            strategyData.bestInterval = interval
          }
        }
      })

      // Xử lý symbol stats
      Object.keys(strategyData.symbols).forEach((symbol) => {
        let bestAvgSymbol = -Infinity
        const symbolData = strategyData.symbols[symbol]

        timeIntervals.forEach((interval) => {
          const stats = symbolData.timeStats[interval]
          if (stats.profits.length > 0) {
            stats.avgProfit = stats.profits.reduce((a, b) => a + b, 0) / stats.profits.length
            stats.avgROI = stats.rois.reduce((a, b) => a + b, 0) / stats.rois.length

            if (stats.avgProfit > bestAvgSymbol) {
              bestAvgSymbol = stats.avgProfit
              symbolData.bestInterval = interval
            }
          }
        })
      })
    })

    // Tạo output format
    const summary = {
      totalStrategies: Object.keys(strategyStats).length,
      totalSignals: results.length,
      totalSymbols: new Set(results.map((r) => r.symbol)).size,
      strategies: {},
    }

    Object.keys(strategyStats).forEach((strategy) => {
      const strategyData = strategyStats[strategy]

      summary.strategies[strategy] = {
        totalSignals: strategyData.totalSignals,
        allPositiveSignals: strategyData.allPositiveSignals,
        bestInterval: strategyData.bestInterval,
        performanceByInterval: {},
        symbols: {},
      }

      // Global performance
      timeIntervals.forEach((interval) => {
        const stats = strategyData.timeStats[interval]
        summary.strategies[strategy].performanceByInterval[interval] = {
          signalCount: stats.count,
          profit: {
            max: stats.maxProfit.toFixed(2),
            min: stats.minProfit.toFixed(2),
            avg: stats.avgProfit.toFixed(2),
          },
          roi: {
            max: stats.maxROI.toFixed(2),
            min: stats.minROI.toFixed(2),
            avg: stats.avgROI.toFixed(2),
          },
        }
      })

      // Symbol performance
      Object.keys(strategyData.symbols).forEach((symbol) => {
        const symbolData = strategyData.symbols[symbol]

        summary.strategies[strategy].symbols[symbol] = {
          totalSignals: symbolData.totalSignals,
          allPositiveSignals: symbolData.allPositiveSignals,
          bestInterval: symbolData.bestInterval,
          performanceByInterval: {},
        }

        timeIntervals.forEach((interval) => {
          const stats = symbolData.timeStats[interval]
          summary.strategies[strategy].symbols[symbol].performanceByInterval[interval] = {
            signalCount: stats.count,
            profit: {
              max: stats.maxProfit.toFixed(2),
              min: stats.minProfit.toFixed(2),
              avg: stats.avgProfit.toFixed(2),
            },
            roi: {
              max: stats.maxROI.toFixed(2),
              min: stats.minROI.toFixed(2),
              avg: stats.avgROI.toFixed(2),
            },
          }
        })
      })
    })

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2))
    console.log(`✅ Báo cáo tổng hợp đã được lưu tại: ${OUTPUT_FILE}`)
  } catch (error) {
    console.error('❌ Lỗi khi tạo báo cáo:', error)
  }
}

generateSummary()
