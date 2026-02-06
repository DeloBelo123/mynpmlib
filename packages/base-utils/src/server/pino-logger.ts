import pino from "pino";

const isDevelopment = process.env.NODE_ENV === "development" || process.env.NODE_ENV === undefined

export const logger = isDevelopment 
  ? pino({
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
          destination: 1, // stdout
        },
      },
      level: "debug",
    })
  : pino({
      level: "info",
    });