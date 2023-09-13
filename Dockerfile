FROM node:18

WORKDIR /app

COPY . .

COPY packages/ ./dist/

RUN yarn && yarn build
