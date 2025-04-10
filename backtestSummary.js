// backtestSummary.js
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
      if (!strategyStats[strategy]) {
        strategyStats[strategy] = {
          totalSignals: 0,
          timeStats: {},
          allPositiveSignals: 0,
          bestInterval: null,
        }

        timeIntervals.forEach((interval) => {
          strategyStats[strategy].timeStats[interval] = {
            count: 0,
            profits: [],
            maxProfit: -Infinity,
            minProfit: Infinity,
            avgProfit: 0,
          }
        })
      }

      strategyStats[strategy].totalSignals++
      let allPositive = true

      // Xử lý từng khung giờ
      timeIntervals.forEach((interval) => {
        const data = entry[`after${interval.replace('h', '')}h`]
        if (data && data.profitPercent) {
          const profit = parseFloat(data.profitPercent)
          if (!isNaN(profit)) {
            const stats = strategyStats[strategy].timeStats[interval]
            stats.count++
            stats.profits.push(profit)
            stats.maxProfit = Math.max(stats.maxProfit, profit)
            stats.minProfit = Math.min(stats.minProfit, profit)

            if (profit <= 0) allPositive = false
          }
        }
      })

      if (allPositive) strategyStats[strategy].allPositiveSignals++
    })

    // Tính toán các giá trị trung bình và xác định interval tốt nhất
    Object.keys(strategyStats).forEach((strategy) => {
      let bestAvg = -Infinity

      timeIntervals.forEach((interval) => {
        const stats = strategyStats[strategy].timeStats[interval]
        if (stats.profits.length > 0) {
          stats.avgProfit = stats.profits.reduce((a, b) => a + b, 0) / stats.profits.length

          if (stats.avgProfit > bestAvg) {
            bestAvg = stats.avgProfit
            strategyStats[strategy].bestInterval = interval
          }
        }
      })
    })

    // Tạo output format
    const summary = {
      totalStrategies: Object.keys(strategyStats).length,
      totalSignals: results.length,
      strategies: {},
    }

    Object.keys(strategyStats).forEach((strategy) => {
      summary.strategies[strategy] = {
        totalSignals: strategyStats[strategy].totalSignals,
        allPositiveSignals: strategyStats[strategy].allPositiveSignals,
        bestInterval: strategyStats[strategy].bestInterval,
        performanceByInterval: {},
      }

      timeIntervals.forEach((interval) => {
        const stats = strategyStats[strategy].timeStats[interval]
        summary.strategies[strategy].performanceByInterval[interval] = {
          signalCount: stats.count,
          maxProfit: stats.maxProfit.toFixed(2),
          minProfit: stats.minProfit.toFixed(2),
          avgProfit: stats.avgProfit.toFixed(2),
        }
      })
    })

    // Lưu file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2))
    console.log(`✅ Báo cáo tổng hợp đã được lưu tại: ${OUTPUT_FILE}`)
  } catch (error) {
    console.error('❌ Lỗi khi tạo báo cáo:', error)
  }
}

generateSummary()
