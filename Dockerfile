FROM node:12

WORKDIR /app

COPY . .

COPY ./src/ ./lib/

RUN yarn build

RUN cd lib && node setup

RUN cd lib && npx grunt default pack

WORKDIR /kkutu
