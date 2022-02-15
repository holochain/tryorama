import { createLogger, format, transports } from "winston";
import env from "./env";

const myFormat = format.printf(({ level, message, label, timestamp }) =>
  label
    ? `${timestamp} [${label}] ${level}: ${message}`
    : `${timestamp} ${level}: ${message}`
);

export const makeLogger = (label?: string, plain?: boolean) =>
  createLogger({
    levels: {
      error: 0,
      warn: 1,
      info: 2,
      verbose: 3,
      debug: 4,
      silly: 5,
    },
    format: format.combine(
      format.splat(),
      format.colorize(),
      format.timestamp({ format: "mediumTime" }),
      format.label(
        label ? { label: plain ? label : `tryorama: ${label}` } : {}
      ),
      myFormat
    ),
    transports: [new transports.Console({ level: env.logLevel })],
  });

export default makeLogger("tryorama", true);
