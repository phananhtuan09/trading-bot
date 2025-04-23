const fs = require('fs')
const path = require('path')
const { getFileNameTimestamp, ensureFoldersExist } = require('../src/utils')

const outputDir = path.join(__dirname, '..', 'logs', 'backtest')
// Get the most recent backtest results file
const getLatestBacktestFile = () => {
  const files = fs
    .readdirSync(outputDir)
    .filter((file) => file.startsWith('backtest_results') && file.endsWith('.json'))
    .sort()
    .reverse()
  return files.length ? path.join(outputDir, files[0]) : null
}

const INPUT_FILE = getLatestBacktestFile()
if (!INPUT_FILE) {
  console.error('❌ Không tìm thấy file backtest results')
  process.exit(1)
}

const OUTPUT_FILE = path.join(outputDir, getFileNameTimestamp('backtest_summary'))

function generateSummary() {
  try {
    ensureFoldersExist(['logs/backtest'])
    const rawData = fs.readFileSync(INPUT_FILE)
    const results = JSON.parse(rawData)

    const totalSignals = results.length
    const totalSymbols = new Set(results.map((r) => r.symbol)).size
    const totalSymbolHitTP = results.filter((r) => r.isHitTp).length
    const totalSymbolHitSL = results.filter((r) => r.isHitSL).length

    const actualROIs = results.map((r) => r.actual_ROI)
    const max_ROI = Math.max(...actualROIs)
    const min_ROI = Math.min(...actualROIs)
    const avg_ROI = actualROIs.reduce((a, b) => a + b, 0) / totalSignals

    // Tính chiến lược tốt nhất
    const strategyPerformance = {}
    results.forEach((entry) => {
      const strat = entry.strategies
      if (!strategyPerformance[strat]) {
        strategyPerformance[strat] = { hitTP: 0, hitSL: 0 }
      } else {
        if (entry.isHitTp) strategyPerformance[strat].hitTP++
        if (entry.isHitSL) strategyPerformance[strat].hitSL++
      }
    })

    let bestStrategies = null
    let bestRatio = -Infinity
    Object.keys(strategyPerformance).forEach((strat) => {
      const { hitTP, hitSL } = strategyPerformance[strat]
      const ratio = hitSL > 0 ? hitTP / hitSL : hitTP
      if (ratio > bestRatio) {
        bestRatio = ratio
        bestStrategies = strat
      }
    })

    // Tính khoảng thời gian tốt nhất
    const intervalPerformance = {}
    results.forEach((entry) => {
      const intervals = [1, 4, 8, 12, 24]
      intervals.forEach((hours) => {
        const key = `${hours}h`
        if (!intervalPerformance[key]) {
          intervalPerformance[key] = { hitTP: 0, hitSL: 0 }
        }
        if (entry.isHitTp && hours >= 1) intervalPerformance[key].hitTP++
        if (entry.isHitSL && hours >= 1) intervalPerformance[key].hitSL++
      })
    })

    let bestInterval = null
    let bestIntervalRatio = -Infinity
    Object.keys(intervalPerformance).forEach((interval) => {
      const { hitTP, hitSL } = intervalPerformance[interval]
      const ratio = hitSL > 0 ? hitTP / hitSL : hitTP
      if (ratio > bestIntervalRatio) {
        bestIntervalRatio = ratio
        bestInterval = interval
      }
    })

    const initialMarginTotal = results.reduce((sum, r) => sum + r.initialMargin, 0)
    const closeMarginTotal = results.reduce((sum, r) => sum + r.closeMargin, 0)
    const close_ROI = ((closeMarginTotal - initialMarginTotal) / initialMarginTotal) * 100

    const summary = {
      totalSignals,
      totalSymbols,
      totalSymbolHitTP,
      totalSymbolHitSL,
      max_ROI,
      min_ROI,
      avg_ROI,
      bestStrategies,
      bestInterval,
      initialMargin: initialMarginTotal,
      closeMargin: closeMarginTotal,
      close_ROI,
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2))
    console.log(`✅ Báo cáo tổng hợp đã được lưu tại: ${OUTPUT_FILE}`)
  } catch (error) {
    console.error('❌ Lỗi khi tạo báo cáo:', error)
  }
}

generateSummary()
