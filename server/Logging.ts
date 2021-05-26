import { createLogger, transports, format } from 'winston'

export const consoleLogger = createLogger({
  format: format.simple(),
  transports: [new transports.Console()]
})
