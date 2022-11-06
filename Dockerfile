FROM node:12

WORKDIR /app

COPY ./src/ ./lib/

RUN cd lib && node setup

RUN cd lib && npx grunt default pack

WORKDIR /kkutu