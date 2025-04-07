const fs = require('fs')
const path = require('path')

const logDir = path.join(__dirname, 'logs')

if (fs.existsSync(logDir)) {
  fs.rmSync(logDir, { recursive: true, force: true })
  console.log('Đã xóa folder logs thành công.')
} else {
  console.log('Folder logs không tồn tại.')
}
