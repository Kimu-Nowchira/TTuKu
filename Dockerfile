FROM node:12

WORKDIR /app

#COPY ./Server/setup.js ./Server/
#COPY ./Server/package*.json ./Server/
#COPY ./Server/lib/package*.json ./Server/lib/
COPY ./lib/ ./lib/

RUN cd lib && node setup

RUN cd lib && npx grunt default pack

WORKDIR /kkutu