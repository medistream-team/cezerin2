FROM node:12-alpine

ARG nodeEnv=development
ENV NODE_ENV=$nodeEnv

ARG storeBaseUrl=http://localhost:3000
ENV STORE_BASE_URL=$storeBaseUrl

ARG adminBaseUrl=http://localhost:3002
ENV ADMIN_BASE_URL=$adminBaseUrl

ARG apiBaseUrl=http://localhost:3001/api/v1
ENV API_BASE_URL=$apiBaseUrl

ARG apiWebSocketUrl=wss://market-api.stg.medistream.co.kr
ENV API_WEB_SOCKET_URL=$apiWebSocketUrl

ARG assetsType=local
ENV ASSETS_TYPE=$assetsType

ARG assetsBaseUrl=http://localhost:3001
ENV ASSETS_BASE_URL=$assetsBaseUrl

ARG dbHost=127.0.0.1
ENV DB_HOST=$dbHost

ARG dbPort=27017
ENV DB_PORT=$dbPort

ARG dbName=market
ENV DB_NAME=$dbName

ARG dbUser=medistream
ENV DB_USER=$dbUser

ARG dbPass=medistream
ENV DB_PASS=$dbPass

ARG smtpHost=smtp
ENV SMTP_HOST=$smtpHost

ARG smtpPort=587
ENV SMTP_PORT=$smtpPort

ARG smtpSecure=false
ENV SMTP_SECURE=$smtpSecure

ARG smtpUser=smtp
ENV SMTP_USER=$smtpUser

ARG smtpPass=smtp
ENV SMTP_PASS=$smtpPass

ARG smtpFromName=smtp
ENV SMTP_FROM_NAME=$smtpFromName

ARG smtpFromAddress=smtp
ENV SMTP_FROM_ADDRESS=$smtpFromAddress

ARG jwtSecretKey=jwt
ENV JWT_SECRET_KEY=$jwtSecretKey

ARG cookieSecretKey=cookie
ENV COOKIE_SECRET_KEY=$cookieSecretKey

# install PM2
RUN npm -g install pm2

RUN mkdir -p /var/www/cezerin2
# download project
ADD . /var/www/cezerin2
#COPY . /var/www/cezerin2/
WORKDIR /var/www/cezerin2

COPY ecosystem.config.js /usr/local/bin/

RUN cd /var/www/cezerin2 \
        && yarn && yarn compile

EXPOSE 3001

CMD ["pm2-runtime", "start", "./build/index.js"]