import winston = require('winston')
import DailyRotateFile = require('winston-daily-rotate-file')

const fileTransport = new DailyRotateFile({
  filename: 'logs/access.log',
  level: 'info',
  timestamp: false,
  json: false,
  showLevel: false,
  maxFiles: 180
})

const fileLogger = new winston.Logger({ transports: [ fileTransport ] })

export const fileLoggerStream = {
  write: function(message) { fileLogger.info(message.trim()) }
}

export const consoleLogger = new winston.Logger({ transports: [ new (winston.transports.Console)() ] })

export const requestLoggingFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] (:response-time[1]ms) ":referrer" ":user-agent"'
