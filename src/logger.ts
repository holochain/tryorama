import { createLogger, format, transports } from 'winston'

const logLevel = 'debug'

const myFormat = format.printf(({ level, message, label, timestamp }) =>
  label
    ? `${timestamp} [${label}] ${level}: ${message}`
    : `${timestamp} ${level}: ${message}`
)

export const makeLogger = (label?, plain?) => createLogger({
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
    format.colorize(),
    format.timestamp({ format: 'mediumTime' }),
    format.label(label ? { label: plain ? label : `try-o-rama: ${label}` } : {}),
    myFormat,
  ),
  transports: [
    new transports.Console({ level: logLevel })
  ]
})

export default makeLogger('try-o-rama', true)
