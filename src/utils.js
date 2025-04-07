const fs = require('fs')

function ensureLogFolders() {
  const logDirs = ['logs/signal']
  logDirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  })
}

function getLogFileName(prefix) {
  const now = new Date()
  const timestamp = now.toISOString().replace(/[:.-]/g, '_')
  return `${prefix}_${timestamp}.json`
}

// Hàm xác định mức độ tín hiệu
function getStrengthLabel(isStrong) {
  return isStrong ? '🔴 Strong' : '🟡 Weak'
}

module.exports = { ensureLogFolders, getLogFileName, getStrengthLabel }
