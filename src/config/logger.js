import pino from "pino";
import env from "./env.js";

const logger = pino({
  level: env.LOG_LEVEL || (env.NODE_ENV === "test" ? "silent" : "info"),
  base: {
    env: env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export default logger;
