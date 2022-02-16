import { createLogger, format, transports } from "winston";
import env from "./env";

const myFormat = format.printf(
  ({ level, message, label, timestamp }) =>
    `${timestamp} [${label}] ${level}: ${message}`
);

export const makeLogger = (label?: string) =>
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
      format.label({ label: label ? `Tryorama - ${label}` : "Tryorama" }),
      myFormat
    ),
    transports: [new transports.Console({ level: env.logLevel })],
  });

export default makeLogger();
