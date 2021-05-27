import { createLogger, format, transports } from 'winston'

export const consoleLogger = createLogger({
  format: format.simple(),
  transports: [new transports.Console()]
})
