const fs = require('fs')

function ensureFoldersExist(folders = []) {
  folders.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  })
}

function getFileNameTimestamp(prefix) {
  const now = new Date()
  const timestamp = now.toISOString().replace(/[:.-]/g, '_')
  return `${prefix}_${timestamp}.json`
}

function log(type, ...args) {
  if (process.env.IS_DEV_MODE === 'true') {
    console[type](...args)
  }
}

module.exports = { ensureFoldersExist, getFileNameTimestamp, log }
