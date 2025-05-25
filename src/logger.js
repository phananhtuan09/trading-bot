const winston = require('winston')
const DailyRotateFile = require('winston-daily-rotate-file')

const transports = []

if (process.env.IS_DEV_MODE === 'true') {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => {
          const type = level === 'error' ? 'error' : 'log'
          return `[${timestamp}] [${type}] ${message}`
        }),
      ),
    }),
  )
}

if (process.env.IS_LOG_ENABLED === 'true') {
  transports.push(
    new DailyRotateFile({
      filename: 'logs/trade/%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => {
          const type = level === 'error' ? 'error' : 'log'
          return `[${timestamp}] [${type}] ${message}`
        }),
      ),
    }),
  )
}

const logger = winston.createLogger({
  level: 'info',
  transports,
})

if (transports.length === 0) {
  logger.add(new winston.transports.Stream({ stream: require('fs').createWriteStream('/dev/null') }))
}

module.exports = logger
