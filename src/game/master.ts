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

import { appendFile } from "fs"
import cluster, { Worker as ClusterWorker } from "node:cluster"
import process from "node:process"

import WebSocket, { Server as WebSocketServer } from "ws"
import * as https from "https"

import { GAME_TYPE, IS_SECURED, KKUTU_MAX, TEST_PORT, TESTER } from "../const"
import { verifyRecaptcha } from "../sub/recaptcha"
import { logger } from "../sub/jjlog"
import Secure from "../sub/secure"
import { config } from "../config"
import Room from "./classes/Room"
import { getRoomList, getUserList, narrate, NIGHT, publish } from "./kkutu"
import Client from "./classes/Client"
import { init as KKuTuInit } from "./kkutu"
import WebServer from "./classes/WebServer"

import { init as DBInit, ip_block, session, users } from "../sub/db"

let HTTPS_Server

let Server: WebSocketServer<WebSocket>

const DIC: Record<string, Client> = {}
const DNAME: Record<string, string> = {}
const ROOM: Record<string, Room> = {}

let T_ROOM = {}
let T_USER = {}

let SID: string
let WDIC = {}

export const DEVELOP = global.test || false
export const GUEST_PERMISSION = {
  create: true,
  enter: true,
  talk: true,
  practice: true,
  ready: true,
  start: true,
  invite: true,
  inviteRes: true,
  kick: true,
  kickVote: true,
  wp: true,
}

export const ENABLE_FORM = ["S", "J"]
export const ENABLE_ROUND_TIME = [10, 30, 60, 90, 120, 150]
export const MODE_LENGTH = GAME_TYPE.length
const PORT = Number(process.env["KKUTU_PORT"])

process.on("uncaughtException", (err: Error) => {
  const text = `:${PORT} [${new Date().toLocaleString()}] ERROR: ${err.toString()}\n${
    err.stack
  }\n`

  appendFile("/jjolol/KKUTU_ERROR.log", text, () => {
    logger.error(`ERROR OCCURRED ON THE MASTER!`)
    console.log(text)
  })
})

function processAdmin(id: string, value: string) {
  let cmd: string = ""
  let temp
  let i: boolean

  value = value.replace(/^(#\w+\s+)?(.+)/, (v, p1, p2) => {
    if (p1) cmd = p1.slice(1).trim()
    return p2
  })

  switch (cmd) {
    case "yell":
      publish("yell", { value: value })
      return null
    case "kill":
      if ((temp = DIC[value])) {
        temp.socket.send('{"type":"error","code":410}')
        temp.socket.close()
      }
      return null
    case "tailroom":
      if ((temp = ROOM[value])) {
        if (T_ROOM[value] == id) {
          i = true
          delete T_ROOM[value]
        } else T_ROOM[value] = id
        if (DIC[id])
          DIC[id].send("tail", {
            a: i ? "trX" : "tr",
            rid: temp.id,
            id: id,
            msg: { pw: temp.password, players: temp.players },
          })
      }
      return null
    case "tailuser":
      if ((temp = DIC[value])) {
        if (T_USER[value] == id) {
          i = true
          delete T_USER[value]
        } else T_USER[value] = id
        temp.send("test")
        if (DIC[id])
          DIC[id].send("tail", {
            a: i ? "tuX" : "tu",
            rid: temp.id,
            id: id,
            msg: temp.getData(),
          })
      }
      return null
    case "dump":
      if (DIC[id])
        DIC[id].send("yell", { value: "This feature is not supported..." })
      /*Heapdump.writeSnapshot("/home/kkutu_memdump_" + Date.now() + ".heapsnapshot", function(err){
				if(err){
					logger.error("Error when dumping!");
					return logger.error(err.toString());
				}
				if(DIC[id]) DIC[id].send('yell', { value: "DUMP OK" });
				logger.info("Dumping success.");
			});*/
      return null
    /* Enhanced User Block System [S] */
    case "ban":
      try {
        let args = value.split(",")
        if (args.length == 2) {
          users
            .update(["_id", args[0].trim()])
            .set(["black", args[1].trim()])
            .on()
        } else if (args.length == 3) {
          users
            .update(["_id", args[0].trim()])
            .set(
              ["black", args[1].trim()],
              ["blockedUntil", addDate(parseInt(args[2].trim()))]
            )
            .on()
        } else return null

        logger.info(
          `[Block] 사용자 #${args[0].trim()}(이)가 이용제한 처리되었습니다.`
        )

        if ((temp = DIC[args[0].trim()])) {
          temp.socket.send('{"type":"error","code":410}')
          temp.socket.close()
        }
      } catch (e) {
        processAdminErrorCallback(e, id)
      }
      return null
    case "ipban":
      try {
        let args = value.split(",")
        if (args.length == 2) {
          ip_block
            .update(["_id", args[0].trim()])
            .set(["reasonBlocked", args[1].trim()])
            .on()
        } else if (args.length == 3) {
          ip_block
            .update(["_id", args[0].trim()])
            .set(
              ["reasonBlocked", args[1].trim()],
              ["ipBlockedUntil", addDate(parseInt(args[2].trim()))]
            )
            .on()
        } else return null

        logger.info(
          `[Block] IP 주소 ${args[0].trim()}(이)가 이용제한 처리되었습니다.`
        )
      } catch (e) {
        processAdminErrorCallback(e, id)
      }
      return null
    case "unban":
      try {
        users
          .update(["_id", value])
          .set(["black", null], ["blockedUntil", 0])
          .on()
        logger.info(
          `[Block] 사용자 #${value}(이)가 이용제한 해제 처리되었습니다.`
        )
      } catch (e) {
        processAdminErrorCallback(e, id)
      }
      return null
    case "ipunban":
      try {
        ip_block
          .update(["_id", value])
          .set(["reasonBlocked", null], ["ipBlockedUntil", 0])
          .on()
        logger.info(
          `[Block] IP 주소 ${value}(이)가 이용제한 해제 처리되었습니다.`
        )
      } catch (e) {
        processAdminErrorCallback(e, id)
      }
      return null
    /* Enhanced User Block System [E] */
  }
  return value
}

/* Enhanced User Block System [S] */
function addDate(num: number) {
  if (isNaN(num)) return
  return Date.now() + num * 24 * 60 * 60 * 1000
}

function processAdminErrorCallback(error: Error, id: string) {
  DIC[id].send("notice", {
    value: `명령을 처리하는 도중 오류가 발생하였습니다: ${error}`,
  })
  logger.warn(`[Block] 명령을 처리하는 도중 오류가 발생하였습니다: ${error}`)
}

/* Enhanced User Block System [E] */
function checkTailUser(id: string, place: number, msg) {
  let temp

  if ((temp = T_USER[id])) {
    if (!DIC[temp]) {
      delete T_USER[id]
      return
    }
    DIC[temp].send("tail", { a: "user", rid: place, id: id, msg: msg })
  }
}

function narrateFriends(id, friends, stat) {
  if (!friends) return
  let fl = Object.keys(friends)

  if (!fl.length) return

  users
    .find(["_id", { $in: fl }], ["server", /^\w+$/])
    .limit(["server", true])
    .on(function ($fon) {
      let i,
        sf = {},
        s

      for (i in $fon) {
        if (!sf[(s = $fon[i].server)]) sf[s] = []
        sf[s].push($fon[i]._id)
      }
      if (DIC[id]) DIC[id].send("friends", { list: sf })

      if (sf[SID]) {
        narrate(sf[SID], "friend", { id: id, s: SID, stat: stat })
        delete sf[SID]
      }

      for (i in WDIC) {
        WDIC[i].send("narrate-friend", { id: id, s: SID, stat: stat, list: sf })
        break
      }
    })
}

cluster.on("message", (worker, msg) => {
  let temp

  switch (msg.type) {
    case "admin":
      if (DIC[msg.id] && DIC[msg.id].admin) processAdmin(msg.id, msg.value)
      break
    case "tail-report":
      if ((temp = T_ROOM[msg.place])) {
        if (!DIC[temp]) delete T_ROOM[msg.place]
        DIC[temp].send("tail", {
          a: "room",
          rid: msg.place,
          id: msg.id,
          msg: msg.msg,
        })
      }
      checkTailUser(msg.id, msg.place, msg.msg)
      break
    case "okg":
      if (DIC[msg.id]) DIC[msg.id].onOKG(msg.time)
      break
    case "kick":
      if (DIC[msg.target]) DIC[msg.target].socket.close()
      break
    case "invite":
      if (!DIC[msg.target]) {
        worker.send({ type: "invite-error", target: msg.id, code: 417 })
        break
      }
      if (DIC[msg.target].place != 0) {
        worker.send({ type: "invite-error", target: msg.id, code: 417 })
        break
      }
      if (!GUEST_PERMISSION.invite)
        if (DIC[msg.target].guest) {
          worker.send({ type: "invite-error", target: msg.id, code: 422 })
          break
        }
      if (DIC[msg.target]._invited) {
        worker.send({ type: "invite-error", target: msg.id, code: 419 })
        break
      }
      DIC[msg.target]._invited = msg.place
      DIC[msg.target].send("invited", { from: msg.place })
      break
    case "room-new":
      if (ROOM[msg.room.id] || !DIC[msg.target]) {
        // 이미 그런 ID의 방이 있다... 그 방은 없던 걸로 해라.
        worker.send({ type: "room-invalid", room: msg.room })
      } else {
        ROOM[msg.room.id] = new Room(msg.room, msg.room.channel)
      }
      break
    case "room-come":
      if (ROOM[msg.id] && DIC[msg.target]) {
        ROOM[msg.id].come(DIC[msg.target])
      } else {
        logger.warn(`Wrong room-come id=${msg.id}&target=${msg.target}`)
      }
      break
    case "room-spectate":
      if (ROOM[msg.id] && DIC[msg.target]) {
        ROOM[msg.id].spectate(DIC[msg.target], msg.pw)
      } else {
        logger.warn(`Wrong room-spectate id=${msg.id}&target=${msg.target}`)
      }
      break
    case "room-go":
      if (ROOM[msg.id] && DIC[msg.target]) {
        ROOM[msg.id].go(DIC[msg.target])
      } else {
        // 나가기 말고 연결 자체가 끊겼을 때 생기는 듯 하다.
        logger.warn(`Wrong room-go id=${msg.id}&target=${msg.target}`)
        if (ROOM[msg.id] && ROOM[msg.id].players) {
          // 이 때 수동으로 지워준다.
          let x = ROOM[msg.id].players.indexOf(msg.target)

          if (x != -1) {
            ROOM[msg.id].players.splice(x, 1)
            logger.warn(`^ OK`)
          }
        }
        if (msg.removed) delete ROOM[msg.id]
      }
      break
    case "user-publish":
      if ((temp = DIC[msg.data.id])) {
        for (let i in msg.data) {
          temp[i] = msg.data[i]
        }
      }
      break
    case "room-publish":
      if ((temp = ROOM[msg.data.room.id])) {
        for (let i in msg.data.room) {
          temp[i] = msg.data.room[i]
        }
        temp.password = msg.password
      }
      publish("room", msg.data)
      break
    case "room-expired":
      if (msg.create && ROOM[msg.id]) {
        for (let i in ROOM[msg.id].players) {
          let $c = DIC[ROOM[msg.id].players[i]]

          if ($c) $c.send("roomStuck")
        }
        delete ROOM[msg.id]
      }
      break
    case "room-invalid":
      delete ROOM[msg.room.id]
      break
    default:
      logger.warn(`Unhandled IPC message type: ${msg.type}`)
  }
})

function joinNewUser($c: Client) {
  $c.send("welcome", {
    id: $c.id,
    guest: $c.guest,
    box: $c.box,
    playTime: $c.data.playTime,
    okg: $c.okgCount,
    users: getUserList(),
    rooms: getRoomList(),
    friends: $c.friends,
    admin: $c.admin,
    test: global.test,
    // 셧다운제 관련 기능 비활성화
    // caj: !!$c._checkAjae,
  })
  narrateFriends($c.id, $c.friends, "on")
  publish("conn", { user: $c.getData() })

  logger.info("New user #" + $c.id)
}

export const onClientMessageOnMaster = ($c: Client, msg) => {
  logger.debug(`Message from #${$c.id} (Master):`, msg)
  if (!msg) return

  if ($c.passRecaptcha) {
    processClientRequest($c, msg)
  } else {
    if (msg.type === "recaptcha") {
      verifyRecaptcha(msg.token, $c.remoteAddress, function (success) {
        if (success) {
          $c.passRecaptcha = true

          joinNewUser($c)

          processClientRequest($c, msg)
        } else {
          logger.warn(`Recaptcha failed from IP ${$c.remoteAddress}`)

          $c.sendError(447)
          $c.socket.close()
        }
      })
    }
  }
}

function processClientRequest($c, msg) {
  let stable = true
  let temp

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
      // 원래는 if (!msg.value.substr) 이었는데... 이걸 말하려던 거였겠지?
      if (typeof msg.value !== "string") return
      if (!GUEST_PERMISSION.talk)
        if ($c.guest) {
          $c.send("error", { code: 401 })
          return
        }
      msg.value = msg.value.substring(0, 200)
      if ($c.admin) {
        if (!processAdmin($c.id, msg.value)) break
      }
      checkTailUser($c.id, $c.place, msg)
      if (msg.whisper) {
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
      break
    case "friendAdd":
      if (!msg.target) return
      if ($c.guest) return
      if ($c.id == msg.target) return
      if (Object.keys($c.friends).length >= 100) return $c.sendError(452)
      if ((temp = DIC[msg.target])) {
        if (temp.guest) return $c.sendError(453)
        if ($c._friend) return $c.sendError(454)
        $c._friend = temp.id
        temp.send("friendAdd", { from: $c.id })
      } else {
        $c.sendError(450)
      }
      break
    case "friendAddRes":
      if (!(temp = DIC[msg.from])) return
      if (temp._friend != $c.id) return
      if (msg.res) {
        // $c와 temp가 친구가 되었다.
        $c.addFriend(temp.id)
        temp.addFriend($c.id)
      }
      temp.send("friendAddRes", { target: $c.id, res: msg.res })
      delete temp._friend
      break
    case "friendEdit":
      if (!$c.friends) return
      if (!$c.friends[msg.id]) return
      $c.friends[msg.id] = (msg.memo || "").slice(0, 50)
      $c.flush(false, false, true)
      $c.send("friendEdit", { friends: $c.friends })
      break
    case "friendRemove":
      if (!$c.friends) return
      if (!$c.friends[msg.id]) return
      $c.removeFriend(msg.id)
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
    case "inviteRes":
      if (!(temp = ROOM[msg.from])) return
      if (!GUEST_PERMISSION.inviteRes) if ($c.guest) return
      if ($c._invited != msg.from) return
      if (msg.res) {
        $c.enter({ id: $c._invited }, false, true)
      } else {
        if (DIC[temp.master])
          DIC[temp.master].send("inviteNo", { target: $c.id })
      }
      delete $c._invited
      break
    /* 망할 셧다운제
		case 'caj':
			if(!$c._checkAjae) return;
			clearTimeout($c._checkAjae);
			if(msg.answer == "yes") $c.confirmAjae(msg.input);
			else if(NIGHT){
				$c.sendError(440);
				$c.socket.close();
			}
			break;
		*/
    case "test":
      checkTailUser($c.id, $c.place, msg)
      break
    default:
      break
  }
}

// $c, code를 받았지만, code를 사용하지 않아서 없애 둠
const onClientClosedOnMaster = ($c: Client) => {
  delete DIC[$c.id]
  if ($c._error != 409) users.update(["_id", $c.id]).set(["server", ""]).on()
  if ($c.profile) delete DNAME[$c.profile.title || $c.profile.name]
  if ($c.socket) $c.socket.removeAllListeners()
  if ($c.friends) narrateFriends($c.id, $c.friends, "off")
  publish("disconn", { id: $c.id })

  logger.info("Exit #" + $c.id)
}

export const init = async (
  _SID: string,
  CHAN: Record<string, ClusterWorker>
) => {
  SID = _SID

  await DBInit()

  logger.info("Master DB is ready.")

  users.update(["server", SID]).set(["server", ""]).on()
  if (IS_SECURED) {
    const options = Secure()
    HTTPS_Server = https
      .createServer(options)
      .listen(global.test ? TEST_PORT + 416 : process.env["KKUTU_PORT"])
    Server = new WebSocket.Server({ server: HTTPS_Server })
  } else {
    Server = new WebSocket.Server({
      port: global.test
        ? TEST_PORT + 416
        : parseInt(process.env["KKUTU_PORT"] || ""),
      perMessageDeflate: false,
    })
  }

  Server.on("connection", (socket, info) => {
    const key = info.url.slice(1)

    socket.on("error", (err) => {
      logger.warn("Error on #" + key + " on ws: " + err.toString())
    })
    // 웹 서버
    if (info.headers.host.startsWith(config.GAME_SERVER_HOST + ":")) {
      if (WDIC[key]) WDIC[key].socket.close()
      WDIC[key] = new WebServer(socket)
      logger.info(`New web server #${key}`)
      WDIC[key].socket.on("close", function () {
        logger.info(`Exit web server #${key}`)
        WDIC[key].socket.removeAllListeners()
        delete WDIC[key]
      })
      return
    }
    if (Object.keys(DIC).length >= KKUTU_MAX) {
      socket.send(`{ "type": "error", "code": "full" }`)
      return
    }
    session
      .findOne(["_id", key])
      .limit(["profile", true])
      .on(function ($body) {
        const $c = new Client(socket, $body ? $body.profile : null, key)
        $c.admin = config.ADMIN.indexOf($c.id) != -1
        /* Enhanced User Block System [S] */
        $c.remoteAddress = config.USER_BLOCK_OPTIONS.USE_X_FORWARDED_FOR
          ? info.connection.remoteAddress
          : (info.headers["x-forwarded-for"] as string) ||
            info.connection.remoteAddress
        /* Enhanced User Block System [E] */

        if (DIC[$c.id]) {
          DIC[$c.id].sendError(408)
          DIC[$c.id].socket.close()
        }
        if (DEVELOP && !TESTER.includes($c.id)) {
          $c.sendError(500)
          $c.socket.close()
          return
        }
        if ($c.guest) {
          if (SID != "0") {
            $c.sendError(402)
            $c.socket.close()
            return
          }
          if (NIGHT) {
            $c.sendError(440)
            $c.socket.close()
            return
          }
        }
        /* Enhanced User Block System [S] */
        if (
          config.USER_BLOCK_OPTIONS.USE_MODULE &&
          ((config.USER_BLOCK_OPTIONS.BLOCK_IP_ONLY_FOR_GUEST && $c.guest) ||
            !config.USER_BLOCK_OPTIONS.BLOCK_IP_ONLY_FOR_GUEST)
        ) {
          ip_block.findOne(["_id", $c.remoteAddress]).on(function ($body) {
            if ($body && $body.reasonBlocked) {
              if ($body.ipBlockedUntil < Date.now()) {
                ip_block
                  .update(["_id", $c.remoteAddress])
                  .set(["ipBlockedUntil", 0], ["reasonBlocked", null])
                  .on()
                logger.info(
                  `IP 주소 ${$c.remoteAddress}의 이용제한이 해제되었습니다.`
                )
              } else {
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
            }
          })
        }
        $c.refresh().then((ref) => {
          /* Enhanced User Block System [S] */
          let isBlockRelease = false

          if (ref.blockedUntil < Date.now()) {
            DIC[$c.id] = $c
            users
              .update(["_id", $c.id])
              .set(["blockedUntil", 0], ["black", null])
              .on()
            logger.info(`사용자 #${$c.id}의 이용제한이 해제되었습니다.`)
            isBlockRelease = true
          }
          /* Enhanced User Block System [E] */

          /* Enhanced User Block System [S] */
          if (ref.result == 200 || isBlockRelease) {
            /* Enhanced User Block System [E] */
            DIC[$c.id] = $c
            DNAME[($c.profile.title || $c.profile.name).replace(/\s/g, "")] =
              $c.id
            users.update(["_id", $c.id]).set(["server", SID]).on()

            if (
              ($c.guest && config.GOOGLE_RECAPTCHA_TO_GUEST) ||
              config.GOOGLE_RECAPTCHA_TO_USER
            ) {
              $c.socket.send(
                JSON.stringify({
                  type: "recaptcha",
                  siteKey: config.GOOGLE_RECAPTCHA_SITE_KEY,
                })
              )
            } else {
              $c.passRecaptcha = true

              joinNewUser($c)
            }
          } else {
            /* Enhanced User Block System [S] */
            if (ref.blockedUntil)
              $c.send("error", {
                code: ref.result,
                message: ref.black,
                blockedUntil: ref.blockedUntil,
              })
            else
              $c.send("error", {
                code: ref.result,
                message: ref.black,
              })
            /* Enhanced User Block System [E] */

            $c._error = ref.result
            $c.socket.close()
            // logger.info("Black user #" + $c.id);
          }
        })
      })
  })

  Server.on("error", (err: Error) => {
    logger.warn("Error on ws: " + err.toString())
  })

  KKuTuInit(DIC, ROOM, GUEST_PERMISSION, CHAN, {
    onClientMessage: onClientMessageOnMaster,
    onClientClosed: onClientClosedOnMaster,
  })
}
