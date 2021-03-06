import os from "os"
import { ApolloServer } from "apollo-server-express"
import bodyParser from "body-parser"
import cookieParser from "cookie-parser"
import express from "express"
import morgan from "morgan"
import helmet from "helmet"
import responseTime from "response-time"
import ajaxRouter from "./ajaxRouter"
import apiRouter from "./apiRouter"
import resolvers from "./graphql/resolvers/index"
import typeDefs from "./graphql/typeDefs/index"
import dashboardWebSocket from "./lib/dashboardWebSocket"
import { logger, sendResponse, stream } from "./lib/logger"
import security from "./lib/security"
import settings from "./lib/settings"

const app = express()
import { AddressInfo } from "net"

const STATIC_OPTIONS = {
  maxAge: 31536000000, // One year
}

app.set("trust proxy", 1)
app.use(helmet())

morgan.token('conversation-id', function getConversationId(req) {
  return req.conversationId;
});
morgan.token('session-id', function getSessionId(req) {
  return req.sessionId;
});
morgan.token('instance-id', function getInstanceId(req) {
  return req.instanceId;
});
morgan.token('hostname', function getHostname() {
  return os.hostname();
});
morgan.token('pid', function getPid() {
  return process.pid;
});

const jsonFormat = (tokens, req, res) => {
  return JSON.stringify({
      'ip': tokens['remote-addr'](req, res) || '',
      'timestamp': tokens['date'](req, res, 'iso') || '',
      'method': tokens['method'](req, res) || '',
      'endpoint': tokens['url'](req, res) || '',
      'httpVersion': tokens['http-version'](req, res) || '',
      'statusCode': tokens['status'](req, res) || '',
      'contentLength': tokens['res'](req, res, 'content-length') || '',
      'referrer': tokens['referrer'](req, res) || '',
      'userAgent': tokens['user-agent'](req, res) || '',
      'conversationId': tokens['conversation-id'](req, res) || '',
      'sessionId': tokens['session-id'](req, res) || '',
      'hostname': tokens['hostname'](req, res) || '',
      'instance': tokens['instance-id'](req, res) || '',
      'pid': tokens['pid'](req, res) || ''
  });
}

app.use(morgan(jsonFormat, {stream}))
// app.use(morgan('combined', {stream}))

app.get("/images/:entity/:id/:size/:filename", (req, res, next) => {
  // A stub of image resizing (can be done with Nginx)
  const newUrl = `/images/${req.params.entity}/${req.params.id}/${req.params.filename}`
  req.url = newUrl
  next()
})
app.use(express.static("public/content", STATIC_OPTIONS))

security.applyMiddleware(app)

app.all("*", (req, res, next) => {
  // CORS headers
  const allowedOrigins = security.getAccessControlAllowOrigin()
  const { origin } = req.headers

  if (allowedOrigins === "*") {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigins)
  } else if (allowedOrigins.indexOf(origin as string) > -1) {
    res.setHeader("Access-Control-Allow-Origin", origin)
  }

  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS")
  res.header("Access-Control-Allow-Credentials", "true")
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Key, Authorization"
  )
  next()
})

app.use(responseTime())
app.use(cookieParser(settings.cookieSecretKey))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use("/ajax", ajaxRouter)
app.use("/api", apiRouter)
app.use(sendResponse)

//  graphql

const graphServer = new ApolloServer({ typeDefs, resolvers })

graphServer.applyMiddleware({ app })

app.listen({ port: 4000 }, () => {
  logger.info("Now browse to http://localhost:4000" + graphServer.graphqlPath)
  console.log("Now browse to http://localhost:4000" + graphServer.graphqlPath)
  const allowedOrigins = security.getAccessControlAllowOrigin()
  logger.info(`Allowed Origins [CORS] ${allowedOrigins}`)
})
// end of graphql
const server = app.listen(settings.apiListenPort, () => {
  const serverAddress = server.address() as AddressInfo
  logger.info(`API running at http://localhost:${serverAddress.port}`)
})

dashboardWebSocket.listen(server)
