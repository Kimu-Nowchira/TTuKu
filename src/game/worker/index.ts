/**
 * Rule the words! KKuTu Online
 * Copyright (C) 2017 JJoriping(op@jjo.kr)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import Client from "../classes/Client"
import { init as KKuTuInit, publish } from "../kkutu"
import { IS_SECURED, TEST_PORT, TESTER } from "../../const"
import Secure from "../../sub/secure"
import * as https from "https"
import process from "node:process"

import WebSocket from "ws"
import { logger } from "../../sub/jjlog"
import Room from "../classes/Room"
import {
  DEVELOP,
  ENABLE_ROUND_TIME,
  MODE_LENGTH,
  GUEST_PERMISSION,
  ENABLE_FORM,
} from "../master"
import { config } from "../../config"
import { init as dbInit, ip_block, session } from "../../sub/db"
import { z } from "zod"
import { IPBlockData, ISession, roomDataSchema, RoomDataToSend } from "../types"
import "./processEvent"
import { onClientMessageOnSlave } from "./clientEvent"

let Server: WebSocket.Server
let HTTPS_Server

export const channelId = Number(process.env["CHANNEL"])

export const DNAME: Record<string, string> = {}
export const workerRoomData: Record<string, Room> = {}
export const workerClientData: Record<string, Client> = {}
export const reservedRoomCache: Record<
  string,
  {
    profile?: string
    room: z.infer<typeof roomDataSchema>
    spec?: string
    pass?: boolean
    _expiration: NodeJS.Timeout
  }
> = {}

export const init = async () => {
  await dbInit()

  logger.info("DB is ready (SLAVE)")
  KKuTuInit(workerClientData, workerRoomData, GUEST_PERMISSION, undefined, {
    onClientClosed: onClientClosedOnSlave,
    onClientMessage: onClientMessageOnSlave,
  })

  if (IS_SECURED) {
    const options = Secure()
    HTTPS_Server = https
      .createServer(options)
      .listen(global.test ? TEST_PORT + 416 : process.env["KKUTU_PORT"])
    Server = new WebSocket.Server({ server: HTTPS_Server })
  } else {
    Server = new WebSocket.Server({
      port: global.test ? TEST_PORT + 416 : Number(process.env["KKUTU_PORT"]),
      perMessageDeflate: false,
    })
  }

  // 플레이어가 소켓에 연결된 경우
  Server.on("connection", async (socket, info) => {
    if (!info.url) throw new Error("No URL on IncomingMessage")

    socket.on("error", (err) => {
      logger.warn("Error on #" + key + " on ws: " + err.toString())
    })

    const chunk = info.url.slice(1).split("&")
    const key = chunk[0]
    const reserve = reservedRoomCache[key]

    if (channelId !== Number(chunk[1])) {
      logger.warn(`Wrong channel value ${chunk[1]} on @${channelId}`)
      socket.close()
      return
    }

    const _room = reserve.room

    if (!reserve.room) {
      logger.error(`Not reserved from ${key} on @${channelId}`)
      return socket.close()
    }

    const room: RoomDataToSend = {
      ..._room,
      id: _room._create ? undefined : _room.id,
      _id: _room._create ? _room.id : undefined,
    }

    clearTimeout(reserve._expiration)
    delete reserve._expiration
    delete reservedRoomCache[key]

    const $body = await session
      .findOne(["_id", key])
      .limit(["profile", true])
      .onAsync<ISession | undefined>()

    const $c = new Client(socket, $body ? $body.profile : null, key)
    $c.admin = config.ADMIN.includes($c.id)

    // IP 차단 여부 확인
    $c.remoteAddress = config.USER_BLOCK_OPTIONS.USE_X_FORWARDED_FOR
      ? info.connection.remoteAddress
      : (info.headers["x-forwarded-for"] as string) ||
        info.connection.remoteAddress

    if (
      config.USER_BLOCK_OPTIONS.USE_MODULE &&
      ((config.USER_BLOCK_OPTIONS.BLOCK_IP_ONLY_FOR_GUEST && $c.guest) ||
        !config.USER_BLOCK_OPTIONS.BLOCK_IP_ONLY_FOR_GUEST)
    ) {
      const ipBlockData = await ip_block
        .findOne(["_id", $c.remoteAddress])
        .onAsync<IPBlockData | undefined>()

      if (ipBlockData && ipBlockData.reasonBlocked) {
        $c.socket.send(
          JSON.stringify({
            type: "error",
            code: 446,
            reasonBlocked: !ipBlockData.reasonBlocked
              ? config.USER_BLOCK_OPTIONS.DEFAULT_BLOCKED_TEXT
              : ipBlockData.reasonBlocked,
            ipBlockedUntil: !ipBlockData.ipBlockedUntil
              ? config.USER_BLOCK_OPTIONS.BLOCKED_FOREVER
              : ipBlockData.ipBlockedUntil,
          })
        )
        $c.socket.close()
        return
      }
    }

    // 이미 게임에 접속해 있는 경우
    if (workerClientData[$c.id]) {
      workerClientData[$c.id].send("error", { code: 408 })
      workerClientData[$c.id].socket.close()
    }

    // 서버 점검 중인데 지정된 테스터 유저가 아닌 경우
    if (DEVELOP && !TESTER.includes($c.id)) {
      $c.send("error", { code: 500 })
      $c.socket.close()
      return
    }

    const ref = await $c.refresh()

    if (ref.result == 200) {
      workerClientData[$c.id] = $c
      DNAME[($c.profile.title || $c.profile.name).replace(/\s/g, "")] = $c.id

      $c.enter(room, reserve.spec, reserve.pass)

      if ($c.place == room.id) $c.publish("connRoom", { user: $c.getData() })
      // 입장 실패
      else $c.socket.close()

      logger.info(`Chan @${channelId} New #${$c.id}`)
    } else {
      $c.send("error", {
        code: ref.result,
        message: ref.black,
      })
      $c._error = ref.result
      $c.socket.close()
    }
  })

  Server.on("error", (err) => {
    logger.warn("Error on ws: " + err.toString())
  })

  logger.info(`<< KKuTu Server:${Server.options.port} >>`)
}

const onClientClosedOnSlave = ($c: Client) => {
  delete workerClientData[$c.id]
  if ($c.profile) delete DNAME[$c.profile.title || $c.profile.name]
  if ($c.socket) $c.socket.removeAllListeners()
  publish("disconnRoom", { id: $c.id })

  logger.info(`Chan @${channelId} Exit #${$c.id}`)
}
