import winston from "winston"
import winstonDaily from "winston-daily-rotate-file"

const { createLogger, format, transports } = winston;
const { combine, timestamp, printf } = format

const logDir = 'logs' 
let logFile = 'dev'
if (process.env.NODE_ENV === 'staging') logFile = 'stg'
if (process.env.NODE_ENV === 'prod') logFile = 'prd'

const accessLogger = createLogger({
  format: combine(
    timestamp({
      // format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.json(),
    // format.prettyPrint(),
    format.colorize(),
    format.splat(),
  ),
  transports: [
    // console log
    new transports.Console({
      level: "info",
      handleExceptions: true,
    }),
    // logger log
    new winstonDaily({
      level: 'info',
      datePattern: 'YYYY-MM-DD',
      dirname: logDir + '/access',
      filename: `${logFile}-access-%DATE%.log`,
      maxFiles: 30,
      zippedArchive: true,
    }),
    new winstonDaily({
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      dirname: logDir + '/error',
      filename: `${logFile}-error-%DATE%.log`,
      maxFiles: 30,
      zippedArchive: true,
    })]
})

const logger = createLogger({
  format: combine(
    timestamp({
      // format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.json(),
    // format.prettyPrint(),
    format.colorize(),
    format.splat(),
  ),
  transports: [
    // console log
    new transports.Console({
      level: "info",
      handleExceptions: true,
    }),
    new transports.Console({
      level: "error",
      handleExceptions: true,
    }),
    // logger log
    new winstonDaily({
      level: 'info',
      datePattern: 'YYYY-MM-DD',
      dirname: logDir,
      filename: `${logFile}-log-%DATE%.log`,
      maxFiles: 15, // 30일치 로그 파일 저장
      zippedArchive: true,
    }),
    new winstonDaily({
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      dirname: logDir + '/error', // error.log 파일은 /logs/error 하위에 저장
      filename: `${logFile}-error-%DATE%.log`,
      maxFiles: 15,
      zippedArchive: true,
    })
  ],
  exitOnError: false 
});

const getResponse = message => ({
  error: true,
  message,
})

const logUnauthorizedRequests = req => {
  // todo
}

const sendResponse = (err, req, res, next) => {
  if (err && err.name === "UnauthorizedError") {
    logUnauthorizedRequests(req)
    res.status(401).send(getResponse(err.message))
  } else if (err) {
    logger.error(err)
    res.status(500).send(getResponse(err.message))
  } else {
    next()
  }
}

const stream = {
  write: message => {
    accessLogger.info(message)
  }
}

export {
  logger, sendResponse, stream
}
