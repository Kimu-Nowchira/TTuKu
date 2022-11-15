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

import Client from "./classes/Client"
import { init as KKuTuInit, publish } from "./kkutu"
import { IS_SECURED, TEST_PORT, TESTER } from "../const"
import Secure from "../sub/secure"
import * as https from "https"
import process from "node:process"

import WebSocket from "ws"
import { appendFile } from "fs"
import { logger } from "../sub/jjlog"
import Room from "./classes/Room"
import {
  DEVELOP,
  ENABLE_ROUND_TIME,
  MODE_LENGTH,
  GUEST_PERMISSION,
  ENABLE_FORM,
} from "./master"
import { config } from "../config"
import { init as dbInit, ip_block, session } from "../Web/db"
import { z } from "zod"

let Server: WebSocket.Server
let HTTPS_Server

const DIC: Record<string, Client> = {}
const DNAME: Record<string, string> = {}
const ROOM: Record<string, Room> = {}
const RESERVED: Record<
  string,
  {
    profile?: string
    room?: any
    spec?: string
    pass?: string
    _expiration?: NodeJS.Timeout
  }
> = {}

const CHAN = Number(process.env["CHANNEL"])

export const init = async () => {
  await dbInit()

  logger.info("DB is ready (SLAVE)")
  KKuTuInit(DIC, ROOM, GUEST_PERMISSION, undefined, {
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

  Server.on("connection", (socket, info) => {
    if (!info.url) throw new Error("No URL on IncomingMessage")

    const chunk = info.url.slice(1).split("&")
    const key = chunk[0]
    const reserve = RESERVED[key] || {}

    socket.on("error", (err) => {
      logger.warn("Error on #" + key + " on ws: " + err.toString())
    })

    if (CHAN !== Number(chunk[1])) {
      logger.warn(`Wrong channel value ${chunk[1]} on @${CHAN}`)
      socket.close()
      return
    }

    const room = reserve.room
    if (room) {
      if (room._create) {
        room._id = room.id
        delete room.id
      }
      clearTimeout(reserve._expiration)
      delete reserve._expiration
      delete RESERVED[key]
    } else {
      logger.warn(`Not reserved from ${key} on @${CHAN}`)
      socket.close()
      return
    }
    session
      .findOne(["_id", key])
      .limit(["profile", true])
      .on(($body) => {
        const $c = new Client(socket, $body ? $body.profile : null, key)
        $c.admin = config.ADMIN.indexOf($c.id) != -1

        /* Enhanced User Block System [S] */
        $c.remoteAddress = config.USER_BLOCK_OPTIONS.USE_X_FORWARDED_FOR
          ? info.connection.remoteAddress
          : (info.headers["x-forwarded-for"] as string) ||
            info.connection.remoteAddress
        if (
          config.USER_BLOCK_OPTIONS.USE_MODULE &&
          ((config.USER_BLOCK_OPTIONS.BLOCK_IP_ONLY_FOR_GUEST && $c.guest) ||
            !config.USER_BLOCK_OPTIONS.BLOCK_IP_ONLY_FOR_GUEST)
        ) {
          ip_block.findOne(["_id", $c.remoteAddress]).on(function ($body) {
            if ($body.reasonBlocked) {
              $c.socket.send(
                JSON.stringify({
                  type: "error",
                  code: 446,
                  reasonBlocked: !$body.reasonBlocked
                    ? config.USER_BLOCK_OPTIONS.DEFAULT_BLOCKED_TEXT
                    : $body.reasonBlocked,
                  ipBlockedUntil: !$body.ipBlockedUntil
                    ? config.USER_BLOCK_OPTIONS.BLOCKED_FOREVER
                    : $body.ipBlockedUntil,
                })
              )
              $c.socket.close()
              return
            }
          })
        }
        /* Enhanced User Block System [E] */
        if (DIC[$c.id]) {
          DIC[$c.id].send("error", { code: 408 })
          DIC[$c.id].socket.close()
        }
        if (DEVELOP && !TESTER.includes($c.id)) {
          $c.send("error", { code: 500 })
          $c.socket.close()
          return
        }
        $c.refresh().then(function (ref) {
          if (ref.result == 200) {
            DIC[$c.id] = $c
            DNAME[($c.profile.title || $c.profile.name).replace(/\s/g, "")] =
              $c.id

            $c.enter(room, reserve.spec, reserve.pass)
            if ($c.place == room.id) {
              $c.publish("connRoom", { user: $c.getData() })
            } else {
              // 입장 실패
              $c.socket.close()
            }
            logger.info(`Chan @${CHAN} New #${$c.id}`)
          } else {
            $c.send("error", {
              code: ref.result,
              message: ref.black,
            })
            $c._error = ref.result
            $c.socket.close()
          }
        })
      })
  })
  Server.on("error", function (err) {
    logger.warn("Error on ws: " + err.toString())
  })

  logger.info(`<< KKuTu Server:${Server.options.port} >>`)
}

process.on("uncaughtException", function (err) {
  const text = `:${
    process.env["KKUTU_PORT"]
  } [${new Date().toLocaleString()}] ERROR: ${err.toString()}\n${err.stack}`

  for (const i in DIC) {
    DIC[i].send("dying")
  }

  appendFile("../KKUTU_ERROR.log", text, () => {
    logger.error(`ERROR OCCURRED! This worker will die in 10 seconds.`)
    console.log(text)
  })

  setTimeout(() => {
    process.exit()
  }, 10000)
})

process.on("message", async (msg: { type: string }) => {
  const inviteErrorSchema = z.object({
    target: z.string(),
    code: z.number(),
  })

  const roomReserveSchema = z.object({
    session: z.string(),
  })

  switch (msg.type) {
    case "invite-error":
      const result = await inviteErrorSchema.safeParseAsync(msg)
      if (!result.success) return logger.error(result.error)
      const { data } = result

      if (!DIC[data.target]) break
      DIC[data.target].sendError(data.code)
      break

    case "room-reserve":
      const result = await roomReserveSchema.safeParseAsync(msg)
      if (!result.success) return logger.error(result.error)
      const { data } = result

      if (RESERVED[msg.session]) {
        // 이미 입장 요청을 했는데 또 하는 경우
        break
      } else
        RESERVED[msg.session] = {
          profile: msg.profile,
          room: msg.room,
          spec: msg.spec,
          pass: msg.pass,
          _expiration: setTimeout(
            (tg, create) => {
              process.send({
                type: "room-expired",
                id: msg.room.id,
                create: create,
              })
              delete RESERVED[tg]
            },
            10000,
            msg.session,
            msg.create
          ),
        }
      break
    case "room-invalid":
      delete ROOM[msg.room.id]
      break
    default:
      logger.warn(`Unhandled IPC message type: ${msg.type}`)
  }
})

export const onClientMessageOnSlave = ($c: Client, msg) => {
  let stable = true
  let temp

  if (!msg) return

  switch (msg.type) {
    case "yell":
      if (!msg.value) return
      if (!$c.admin) return

      $c.publish("yell", { value: msg.value })
      break
    case "refresh":
      $c.refresh()
      break
    case "talk":
      if (!msg.value) return
      if (typeof msg.value !== "string") return
      if (!GUEST_PERMISSION.talk)
        if ($c.guest) {
          $c.send("error", { code: 401 })
          return
        }
      msg.value = msg.value.substring(0, 200)
      if (msg.relay) {
        if ($c.subPlace) temp = $c.pracRoom
        else if (!(temp = ROOM[$c.place])) return
        if (!temp.gaming) return
        if (temp.game.late) {
          $c.chat(msg.value)
        } else if (!temp.game.loading) {
          temp.submit($c, msg.value, msg.data)
        }
      } else {
        if ($c.admin) {
          if (msg.value.charAt() == "#") {
            process.send({ type: "admin", id: $c.id, value: msg.value })
            break
          }
        }
        if (msg.whisper) {
          process.send({
            type: "tail-report",
            id: $c.id,
            chan: CHAN,
            place: $c.place,
            msg: msg,
          })
          msg.whisper.split(",").forEach((v) => {
            if ((temp = DIC[DNAME[v]])) {
              temp.send("chat", {
                from: $c.profile.title || $c.profile.name,
                profile: $c.profile,
                value: msg.value,
              })
            } else {
              $c.sendError(424, v)
            }
          })
        } else {
          $c.chat(msg.value)
        }
      }
      break
    case "enter":
    case "setRoom":
      if (!msg.title) stable = false
      if (!msg.limit) stable = false
      if (!msg.round) stable = false
      if (!msg.time) stable = false
      if (!msg.opts) stable = false

      msg.code = false
      msg.limit = Number(msg.limit)
      msg.mode = Number(msg.mode)
      msg.round = Number(msg.round)
      msg.time = Number(msg.time)

      if (isNaN(msg.limit)) stable = false
      if (isNaN(msg.mode)) stable = false
      if (isNaN(msg.round)) stable = false
      if (isNaN(msg.time)) stable = false

      if (stable) {
        if (msg.title.length > 20) stable = false
        if (msg.password.length > 20) stable = false
        if (msg.limit < 2 || msg.limit > 8) {
          msg.code = 432
          stable = false
        }
        if (msg.mode < 0 || msg.mode >= MODE_LENGTH) stable = false
        if (msg.round < 1 || msg.round > 10) {
          msg.code = 433
          stable = false
        }
        if (ENABLE_ROUND_TIME.indexOf(msg.time) == -1) stable = false
      }
      if (msg.type == "enter") {
        if (msg.id || stable) $c.enter(msg, msg.spectate)
        else $c.sendError(msg.code || 431)
      } else if (msg.type == "setRoom") {
        if (stable) $c.setRoom(msg)
        else $c.sendError(msg.code || 431)
      }
      break
    case "leave":
      if (!$c.place) return

      $c.leave()
      break
    case "ready":
      if (!$c.place) return
      if (!GUEST_PERMISSION.ready) if ($c.guest) return

      $c.toggle()
      break
    case "start":
      if (!$c.place) return
      if (!ROOM[$c.place]) return
      if (ROOM[$c.place].gaming) return
      if (!GUEST_PERMISSION.start) if ($c.guest) return

      $c.start()
      break
    case "practice":
      if (!ROOM[$c.place]) return
      if (ROOM[$c.place].gaming) return
      if (!GUEST_PERMISSION.practice) if ($c.guest) return
      if (isNaN((msg.level = Number(msg.level)))) return
      if (ROOM[$c.place].rule.ai) {
        if (msg.level < 0 || msg.level >= 5) return
      } else if (msg.level != -1) return

      $c.practice(msg.level)
      break
    case "invite":
      if (!ROOM[$c.place]) return
      if (ROOM[$c.place].gaming) return
      if (ROOM[$c.place].master != $c.id) return
      if (!GUEST_PERMISSION.invite) if ($c.guest) return
      if (msg.target == "AI") {
        ROOM[$c.place].addAI($c)
      } else {
        process.send({
          type: "invite",
          id: $c.id,
          place: $c.place,
          target: msg.target,
        })
      }
      break
    case "inviteRes":
      if (!(temp = ROOM[msg.from])) return
      if (!GUEST_PERMISSION.inviteRes) if ($c.guest) return
      if (msg.res) {
        $c.enter({ id: msg.from }, false, true)
      } else {
        if (DIC[temp.master])
          DIC[temp.master].send("inviteNo", { target: $c.id })
      }
      break
    case "form":
      if (!msg.mode) return
      if (!ROOM[$c.place]) return
      if (ENABLE_FORM.indexOf(msg.mode) == -1) return

      $c.setForm(msg.mode)
      break
    case "team":
      if (!ROOM[$c.place]) return
      if (ROOM[$c.place].gaming) return
      if ($c.ready) return
      if (isNaN((temp = Number(msg.value)))) return
      if (temp < 0 || temp > 4) return

      $c.setTeam(Math.round(temp))
      break
    case "kick":
      if (!msg.robot) if (!(temp = DIC[msg.target])) return
      if (!ROOM[$c.place]) return
      if (ROOM[$c.place].gaming) return
      if (!msg.robot) if ($c.place != temp.place) return
      if (ROOM[$c.place].master != $c.id) return
      if (ROOM[$c.place].kickVote) return
      if (!GUEST_PERMISSION.kick) if ($c.guest) return

      if (msg.robot) $c.kick(null, msg.target)
      else $c.kick(msg.target)
      break
    case "kickVote":
      if (!(temp = ROOM[$c.place])) return
      if (!temp.kickVote) return
      if ($c.id == temp.kickVote.target) return
      if ($c.id == temp.master) return
      if (temp.kickVote.list.indexOf($c.id) != -1) return
      if (!GUEST_PERMISSION.kickVote) if ($c.guest) return

      $c.kickVote($c, msg.agree)
      break
    case "handover":
      if (!DIC[msg.target]) return
      if (!(temp = ROOM[$c.place])) return
      if (temp.gaming) return
      if ($c.place != DIC[msg.target].place) return
      if (temp.master != $c.id) return

      temp.master = msg.target
      temp.export()
      break
    case "wp":
      if (!msg.value) return
      if (!GUEST_PERMISSION.wp)
        if ($c.guest) {
          $c.send("error", { code: 401 })
          return
        }

      msg.value = msg.value.substring(0, 200)
      msg.value = msg.value.replace(/[^a-z가-힣]/g, "")
      if (msg.value.length < 2) return
      break
    case "setAI":
      if (!msg.target) return
      if (!ROOM[$c.place]) return
      if (ROOM[$c.place].gaming) return
      if (ROOM[$c.place].master != $c.id) return
      if (isNaN((msg.level = Number(msg.level)))) return
      if (msg.level < 0 || msg.level >= 5) return
      if (isNaN((msg.team = Number(msg.team)))) return
      if (msg.team < 0 || msg.team > 4) return

      ROOM[$c.place].setAI(
        msg.target,
        Math.round(msg.level),
        Math.round(msg.team)
      )
      break
    default:
      break
  }
}

const onClientClosedOnSlave = ($c: Client) => {
  delete DIC[$c.id]
  if ($c.profile) delete DNAME[$c.profile.title || $c.profile.name]
  if ($c.socket) $c.socket.removeAllListeners()
  publish("disconnRoom", { id: $c.id })

  logger.info(`Chan @${CHAN} Exit #${$c.id}`)
}
