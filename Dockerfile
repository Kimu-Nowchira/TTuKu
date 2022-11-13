FROM node:18

WORKDIR /app

COPY . .

COPY ./src/ ./lib/

RUN yarn && yarn build
