const fs = require('fs')
const path = require('path')
const { getFileNameTimestamp, ensureFoldersExist, log } = require('../src/utils')

const outputDir = path.join(__dirname, '..', 'logs', 'backtest')

const getLatestBacktestFile = () => {
  if (!fs.existsSync(outputDir)) {
    log('warn', `Thư mục logs/backtest không tồn tại: ${outputDir}`)
    return null
  }
  const files = fs
    .readdirSync(outputDir)
    .filter((file) => file.startsWith('backtest_results') && file.endsWith('.json'))
    .map((file) => ({ file, mtime: fs.statSync(path.join(outputDir, file)).mtime }))
    .sort((a, b) => b.mtime - a.mtime) // Sắp xếp theo thời gian sửa đổi mới nhất
  return files.length ? path.join(outputDir, files[0].file) : null
}

const INPUT_FILE = getLatestBacktestFile()
if (!INPUT_FILE) {
  log('error', '❌ Không tìm thấy file backtest results')
  process.exit(1)
}
log('log', `📄 Đang sử dụng file backtest: ${INPUT_FILE}`)

const OUTPUT_FILE = path.join(outputDir, getFileNameTimestamp('backtest_summary'))

function generateSummary() {
  try {
    ensureFoldersExist(['logs/backtest'])
    const rawData = fs.readFileSync(INPUT_FILE)
    const results = JSON.parse(rawData)

    if (results.length === 0) {
      log('warn', '⚠️ File backtest không có dữ liệu để tạo summary.')
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ message: 'No data in backtest results to summarize.' }, null, 2))
      log('log', `ℹ️ Đã tạo file summary trống tại: ${OUTPUT_FILE}`)
      return
    }

    const totalSignals = results.length
    const totalSymbols = new Set(results.map((r) => r.symbol)).size
    const totalHitTP = results.filter((r) => r.isHitTp).length
    const totalHitSL = results.filter((r) => r.isHitSL).length
    const totalTimeout = results.filter((r) => r.reasonClose && r.reasonClose.startsWith('timeout')).length
    const totalEndOfData = results.filter((r) => r.reasonClose === 'endOfData').length

    const actualROIs = results.map((r) => r.actual_ROI).filter((roi) => typeof roi === 'number') // Lọc các giá trị không phải số
    const max_ROI = actualROIs.length > 0 ? Math.max(...actualROIs) : 0
    const min_ROI = actualROIs.length > 0 ? Math.min(...actualROIs) : 0
    const avg_ROI = actualROIs.length > 0 ? actualROIs.reduce((a, b) => a + b, 0) / actualROIs.length : 0
    const profitableTrades = results.filter((r) => r.actual_ROI > 0).length
    const losingTrades = results.filter((r) => r.actual_ROI < 0).length
    const winRate = totalSignals > 0 ? (profitableTrades / (profitableTrades + losingTrades)) * 100 : 0 // Chỉ tính trên trade có lời hoặc lỗ

    const strategyPerformance = {}
    results.forEach((entry) => {
      const strat = entry.strategies
      if (!strategyPerformance[strat]) {
        strategyPerformance[strat] = {
          hitTP: 0,
          hitSL: 0,
          timeout: 0,
          totalTrades: 0,
          totalROI: 0,
          ROIs: [],
        }
      }
      strategyPerformance[strat].totalTrades++
      strategyPerformance[strat].totalROI += entry.actual_ROI
      strategyPerformance[strat].ROIs.push(entry.actual_ROI)
      if (entry.isHitTp) strategyPerformance[strat].hitTP++
      else if (entry.isHitSL) strategyPerformance[strat].hitSL++
      else if (entry.reasonClose && entry.reasonClose.startsWith('timeout')) strategyPerformance[strat].timeout++
    })

    let bestStrategiesByWinRate = null
    let bestWinRateRatio = -1

    let bestStrategiesByAvgROI = null
    let highestAvgROI = -Infinity

    Object.entries(strategyPerformance).forEach(([strat, perf]) => {
      const tradesConsidered = perf.hitTP + perf.hitSL
      const currentWinRate = tradesConsidered > 0 ? (perf.hitTP / tradesConsidered) * 100 : 0
      if (currentWinRate > bestWinRateRatio) {
        bestWinRateRatio = currentWinRate
        bestStrategiesByWinRate = strat
      }

      const currentAvgROI = perf.totalTrades > 0 ? perf.totalROI / perf.totalTrades : 0
      if (currentAvgROI > highestAvgROI) {
        highestAvgROI = currentAvgROI
        bestStrategiesByAvgROI = strat
      }
      // Thêm thông tin trung bình cho mỗi chiến lược
      strategyPerformance[strat].avgROI = currentAvgROI
      strategyPerformance[strat].winRate = currentWinRate
    })

    // Phân tích thời gian giữ lệnh trung bình
    const avgHitTimeCandlesTP =
      results.filter((r) => r.isHitTp && r.hitTimeCandles != null).reduce((sum, r) => sum + r.hitTimeCandles, 0) /
        totalHitTP || 0
    const avgHitTimeCandlesSL =
      results.filter((r) => r.isHitSL && r.hitTimeCandles != null).reduce((sum, r) => sum + r.hitTimeCandles, 0) /
        totalHitSL || 0

    const reasonCloseCounts = {
      hitTP: totalHitTP,
      hitSL: totalHitSL,
      timeout: totalTimeout, // Tổng các loại timeout
      endOfData: totalEndOfData,
    }
    results.forEach((r) => {
      // Đếm cụ thể các loại timeout nếu cần
      if (r.reasonClose && r.reasonClose.startsWith('timeout')) {
        reasonCloseCounts[r.reasonClose] = (reasonCloseCounts[r.reasonClose] || 0) + 1
      }
    })

    const strengthCounts = {}
    const minStrength = Math.min(...results.map((r) => r.strength).filter((s) => s != null))
    const maxStrength = Math.max(...results.map((r) => r.strength).filter((s) => s != null))

    if (isFinite(minStrength) && isFinite(maxStrength)) {
      for (let s = minStrength; s <= maxStrength; s++) {
        const count = results.filter((r) => r.strength === s).length
        if (count > 0) strengthCounts[s] = count
      }
    }

    const initialMarginTotal = results.reduce((sum, r) => sum + r.initialMargin, 0)
    const closeMarginTotal = results.reduce((sum, r) => sum + r.closeMargin, 0)
    const totalPnl = closeMarginTotal - initialMarginTotal
    const overall_ROI_on_total_initial_margin = initialMarginTotal !== 0 ? (totalPnl / initialMarginTotal) * 100 : 0

    const summary = {
      inputFile: INPUT_FILE,
      summaryDate: new Date().toISOString(),
      totalSignals,
      totalSymbols,
      profitableTrades,
      losingTrades,
      winRate: parseFloat(winRate.toFixed(2)),
      totalHitTP,
      totalHitSL,
      totalTimeout,
      totalEndOfData,
      max_ROI: parseFloat(max_ROI.toFixed(2)),
      min_ROI: parseFloat(min_ROI.toFixed(2)),
      avg_ROI: parseFloat(avg_ROI.toFixed(2)),
      bestStrategiesByWinRate: { strategy: bestStrategiesByWinRate, winRate: parseFloat(bestWinRateRatio.toFixed(2)) },
      bestStrategiesByAvgROI: { strategy: bestStrategiesByAvgROI, avgROI: parseFloat(highestAvgROI.toFixed(2)) },
      avgHitTimeCandlesTP: parseFloat(avgHitTimeCandlesTP.toFixed(2)),
      avgHitTimeCandlesSL: parseFloat(avgHitTimeCandlesSL.toFixed(2)),
      initialMarginTotal: parseFloat(initialMarginTotal.toFixed(2)),
      closeMarginTotal: parseFloat(closeMarginTotal.toFixed(2)),
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      overall_ROI_on_total_initial_margin: parseFloat(overall_ROI_on_total_initial_margin.toFixed(2)),
      reasonCloseCounts,
      strengthCounts,
      detailedStrategyPerformance: Object.fromEntries(
        Object.entries(strategyPerformance).map(([strat, perf]) => [
          strat,
          {
            ...perf,
            avgROI: parseFloat(perf.avgROI.toFixed(2)),
            winRate: parseFloat(perf.winRate.toFixed(2)),
            ROIs: perf.ROIs.map((r) => parseFloat(r.toFixed(2))), // Làm tròn ROI trong mảng
          },
        ]),
      ),
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2))
    log('log', `✅ Báo cáo tổng hợp đã được lưu tại: ${OUTPUT_FILE}`)
  } catch (error) {
    log('error', '❌ Lỗi khi tạo báo cáo:', error)
    log('error', error.stack)
  }
}

generateSummary()
