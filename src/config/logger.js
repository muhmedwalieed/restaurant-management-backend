import pino from "pino";
import pinoPretty from "pino-pretty";
import env from "./env.js";

const isDev = env.NODE_ENV === "development";

const destination = isDev
  ? pinoPretty({
      colorize: false,
      translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
      ignore: "pid,hostname",
      hideObject: true,
      customPrettifiers: {
        level: (logLevel, key, log) => `${String(logLevel).toUpperCase()} (${log.env})`,
      },
    })
  : pino.destination(1);

const logger = pino(
  {
    level: env.LOG_LEVEL || (env.NODE_ENV === "test" ? "silent" : "info"),
    base: {
      env: env.NODE_ENV,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  },
  destination
);

export default logger;
