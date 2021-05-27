import { createLogger, format, transports } from 'winston'

export const logger = createLogger({
  format: format.simple(),
  transports: [new transports.Console()]
})
