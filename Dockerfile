FROM node:18

WORKDIR /app

COPY . .

COPY ./src/ ./dist/

RUN yarn && yarn build
