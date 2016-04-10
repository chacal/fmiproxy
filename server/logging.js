var winston = require('winston')
var DailyRotateFile = require('winston-daily-rotate-file')

var fileTransport = new DailyRotateFile({
  filename: 'logs/access.log',
  level: 'info',
  timestamp: false,
  json: false,
  showLevel: false,
  maxFiles: 180
})
var fileLogger = new winston.Logger({ transports: [ fileTransport ] })
var fileLoggerStream = {
  write: function(message) { fileLogger.info(message.trim()) }
}

var consoleLogger = new winston.Logger({ transports: [ new (winston.transports.Console)() ] })

var requestLoggingFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] (:response-time[1]ms) ":referrer" ":user-agent"'


module.exports = {
  console: consoleLogger,
  file: fileLogger,
  fileLoggerStream: fileLoggerStream,
  requestLoggingFormat: requestLoggingFormat
}
