import { createLogger, format, transports } from 'winston'
import { NullTransport } from 'winston-null'

const logLevel = 'debug'

export const makeLogger = (label?) => createLogger({
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    verbose: 3,
    debug: 4,
    silly: 5
  },
  format: format.combine(
    format.splat(),
    format.simple(),
    format.label(label ? { label } : {})
  ),
  transports: [
    new transports.Console({ level: logLevel })
  ]
})

export default makeLogger()
