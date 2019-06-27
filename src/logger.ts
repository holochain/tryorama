import {createLogger, format, transports} from 'winston'
import {NullTransport} from 'winston-null'

const logLevel = 'info'

const logger = createLogger({
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
  ),
  transports: [
    new transports.Console({level: logLevel})
  ]
})

export default logger