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

import cluster, { Worker as ClusterWorker } from "node:cluster"
import { all, Tail } from "../sub/lizard"
import {
  BLOCKED_LENGTH,
  GAME_TYPE,
  getRule,
  IJP_EXCEPT,
  KICK_BY_SPAM,
  MAX_OBSERVER,
  SPAM_ADD_DELAY,
  SPAM_CLEAR_DELAY,
  SPAM_LIMIT,
  OPTIONS,
} from "../const"
import { logger } from "../sub/jjlog"
import { WebSocket } from "ws"
import { Game } from "./games"
import Classic from "./games/classic"

export type RoomData = Record<number, Room>
export type DICData = Record<string, Client>

let GUEST_PERMISSION: Record<string, boolean> = {}

var DB
var SHOP

let DIC: DICData = {}
let ROOM: RoomData = {}
let CHAN: Record<string, ClusterWorker> = {}

let _rid: number

const Rule: Record<string, typeof Game> = {
  Classic: Classic,
}

const guestProfiles = []
const channel = process.env["CHANNEL"] || 0

const NUM_SLAVES = 4
const GUEST_IMAGE = "/img/kkutu/guest.png"
const MAX_OKG = 18
const PER_OKG = 600000

export const NIGHT = false

export const init = (
  _DB,
  _DIC: DICData,
  _ROOM: RoomData,
  _GUEST_PERMISSION: Record<string, boolean>,
  _CHAN: Record<string, ClusterWorker>
) => {
  DB = _DB
  DIC = _DIC
  ROOM = _ROOM
  GUEST_PERMISSION = _GUEST_PERMISSION
  CHAN = _CHAN
  _rid = 100

  DB.kkutu_shop.find().on(($shop) => {
    SHOP = {}

    $shop.forEach((item) => {
      SHOP[item._id] = item
    })
  })

  // 새로운 방식을 사용함에 따라 비활성화
  // for (const i in RULE) {
  //   const k = RULE[i as keyof typeof RULE].rule as string
  //   Rule[k] = require(`./games/${k.toLowerCase()}`)
  //   Rule[k].init(DB, DIC)
  // }
}

export const getUserList = () => {
  const res = {}
  for (const i in DIC) res[i] = DIC[i].getData()
  return res
}

export const getRoomList = () => {
  const res = {}
  for (const i in ROOM) res[i] = ROOM[i].getData()
  return res
}

export const narrate = (list, type, data) => {
  list.forEach((v) => {
    if (DIC[v]) DIC[v].send(type, data)
  })
}

export const publish = (type: string, data, _room) => {
  if (cluster.isPrimary) {
    for (const i in DIC) {
      DIC[i].send(type, data)
    }
  } else if (cluster.isWorker) {
    if (type == "room")
      process.send({ type: "room-publish", data: data, password: _room })
    else
      for (const i in DIC) {
        DIC[i].send(type, data)
      }
  }
}

export class Robot {
  id: string
  robot: boolean = true
  game: Record<string, any> = {}
  data: Record<string, any> = {}
  equip: Record<string, any> = { robot: true }

  constructor(
    public target: string | null,
    public place: number,
    public level: number
  ) {
    this.id = target + place + Math.floor(Math.random() * 1000000000)
    this.setLevel(level)
    this.setTeam(0)
  }

  getData() {
    return {
      id: this.id,
      robot: true,
      game: this.game,
      data: this.data,
      place: this.place,
      target: this.target,
      equip: this.equip,
      level: this.level,
      ready: true,
    }
  }

  setLevel(level: number) {
    this.level = level
    this.data.score = Math.pow(10, level + 2)
  }

  setTeam(team: number) {
    this.game.team = team
  }

  send() {}

  obtain() {}

  invokeWordPiece(_text: any, _coef: any) {}

  publish(type: string, data: any, _noBlock?: boolean) {
    if (this.target === null) {
      for (const i in DIC) {
        if (DIC[i].place == this.place) DIC[i].send(type, data)
      }
    } else if (DIC[this.target]) {
      DIC[this.target].send(type, data)
    }
  }

  chat(msg: string, _code: any) {
    this.publish("chat", { value: msg })
  }

  isRobot(): this is Robot {
    return true
  }
}

class Data {
  score: number
  playTime: number
  connectDate: number
  record: Record<string, any>

  constructor(data?: {
    score: number
    playTime: number
    connectDate: number
    record: Record<string, number[]>
  }) {
    if (!data)
      data = {
        score: 0,
        playTime: 0,
        connectDate: 0,
        record: {},
      }

    this.score = data.score || 0
    this.playTime = data.playTime || 0
    this.connectDate = data.connectDate || 0
    this.record = {}
    for (const i in GAME_TYPE) {
      const j = GAME_TYPE[i]
      this.record[j] = data.record
        ? data.record[GAME_TYPE[i]] || [0, 0, 0, 0]
        : [0, 0, 0, 0]
      if (!this.record[j][3]) this.record[j][3] = 0
    }
  }
  // 전, 승, 점수
}

export class WebServer {
  constructor(public socket: WebSocket) {
    socket.on("message", (msg: any) => {
      try {
        msg = JSON.parse(msg)
      } catch (e) {
        return logger.error("JSON.parse() failed: " + msg)
      }

      switch (msg.type) {
        case "seek":
          this.send("seek", { value: Object.keys(DIC).length })
          break
        case "narrate-friend":
          exports.narrate(msg.list, "friend", {
            id: msg.id,
            s: msg.s,
            stat: msg.stat,
          })
      }
    })
  }

  send(type: string, data: any) {
    if (this.socket.readyState === 1)
      this.socket.send(JSON.stringify({ ...(data || {}), type }))
  }
}

export class Client {
  id: string

  place = 0
  team = 0
  ready = false
  game: Record<string, any> = {}

  subPlace = 0
  error = false
  blocked = false
  spam = 0
  _pub = Date.now()

  guest = false
  isAjae: boolean

  pracRoom: any // Room
  data: Data

  okgCount: number
  form: any
  money: number
  equip: any
  exordial: string
  numSpam: any

  box: any
  noChat: boolean
  friends: any

  cameWhenGaming: boolean

  robot = false

  constructor(
    public socket: WebSocket,
    public profile: any,
    public sid: string
  ) {
    if (profile) {
      this.id = profile.id

      delete this.profile.token
      delete this.profile.sid

      if (this.profile.title) this.profile.name = "anonymous"
    } else {
      const gp = guestProfiles[Math.floor(Math.random() * guestProfiles.length)]

      this.id = "guest__" + sid
      this.guest = true
      this.isAjae = false
      this.profile = {
        id: sid,
        title: getGuestName(sid),
        image: GUEST_IMAGE,
      }
    }

    socket.on("close", (code) => {
      if (ROOM[this.place]) ROOM[this.place].go(this)
      if (this.subPlace) this.pracRoom.go(this)
      exports.onClientClosed(this, code)
    })

    socket.on("message", (msg: any) => {
      let data
      const room = ROOM[this.place]
      if (!this) return logger.warn("this is null")
      if (!msg) return logger.warn("msg is null")

      logger.info(`Chan @${channel} Msg #${this.id}: ${msg}`)
      try {
        data = JSON.parse(msg)
      } catch (e) {
        data = { error: 400 }
      }
      if (cluster.isWorker)
        process.send({
          type: "tail-report",
          id: this.id,
          chan: channel,
          place: this.place,
          msg: data.error ? msg : data,
        })

      exports.onClientMessage(this, data)
    })
  }

  onOKG(time: number) {
    if (cluster.isPrimary) return logger.warn("onOKG() called on primary")
    const d = new Date().getDate()

    if (this.guest) return logger.warn("onOKG() called on guest")
    if (d != this.data.connectDate) {
      this.data.connectDate = d
      this.data.playTime = 0
      this.okgCount = 0
    }
    this.data.playTime += time

    while (this.data.playTime >= PER_OKG * (this.okgCount + 1)) {
      if (this.okgCount >= MAX_OKG) return
      this.okgCount++
    }
    this.send("okg", { time: this.data.playTime, count: this.okgCount })
    // process.send({ type: 'okg', id: my.id, time: time });
  }

  getData(gaming?: boolean) {
    return {
      id: this.id,
      guest: this.guest,
      game: {
        ready: this.ready,
        form: this.form,
        team: this.team,
        practice: this.subPlace,
        score: this.game.score,
        item: this.game.item,
      },
      profile: gaming ? null : this.profile,
      place: gaming ? null : this.place,
      data: gaming ? null : this.data,
      money: gaming ? null : this.money,
      equip: gaming ? null : this.equip,
      exordial: gaming ? null : this.exordial,
    }
  }

  send(type: string, data?: any) {
    var r = data || {}

    r.type = type

    if (this.socket.readyState == 1) this.socket.send(JSON.stringify(r))
  }

  sendError(code: number, msg?: string) {
    this.send("error", { code: code, message: msg })
  }

  publish(type, data, noBlock?: boolean) {
    const now = Date.now()
    const st = now - this._pub

    if (st <= SPAM_ADD_DELAY) this.spam++
    else if (st >= SPAM_CLEAR_DELAY) this.spam = 0
    if (this.spam >= SPAM_LIMIT) {
      if (!this.blocked) this.numSpam = 0
      this.blocked = true
    }
    if (!noBlock) {
      this._pub = now
      if (this.blocked) {
        if (st < BLOCKED_LENGTH) {
          if (++this.numSpam >= KICK_BY_SPAM) {
            if (cluster.isWorker)
              process.send({ type: "kick", target: this.id })
            return this.socket.close()
          }
          return this.send("blocked")
        } else this.blocked = false
      }
    }
    data.profile = this.profile
    if (this.subPlace && type != "chat") this.send(type, data)
    else
      for (const i in DIC) {
        if (DIC[i].place == this.place) DIC[i].send(type, data)
      }
    if (cluster.isWorker && type == "user")
      process.send({ type: "user-publish", data: data })
  }

  chat(msg: string, code?: string) {
    if (this.noChat) return this.send("chat", { notice: true, code: 443 })
    this.publish("chat", { value: msg, notice: !!code, code: code })
  }

  checkExpire() {
    const d = new Date().getDate()
    const now = new Date().getTime() * 0.001

    var expired = []
    var gr

    if (d != this.data.connectDate) {
      this.data.connectDate = d
      this.data.playTime = 0
    }
    for (const i in this.box) {
      if (!this.box[i]) {
        delete this.box[i]
        continue
      }
      if (!this.box[i].expire) continue
      if (this.box[i].expire < now) {
        gr = SHOP[i].group

        if (gr.substring(0, 3) == "BDG") gr = "BDG"
        if (this.equip[gr] == i) delete this.equip[gr]
        delete this.box[i]
        expired.push(i)
      }
    }
    if (expired.length) {
      this.send("expired", { list: expired })
      this.flush(this.box, this.equip)
    }
  }

  refresh() {
    var R = new Tail()

    if (this.guest) {
      this.equip = {}
      this.data = new Data()
      this.money = 0
      this.friends = {}

      R.go({ result: 200 })
    } else
      DB.users.findOne(["_id", this.id]).on(($user) => {
        var first = !$user
        var black = first ? "" : $user.black
        /* Enhanced User Block System [S] */
        const blockedUntil =
          first || !$user.blockedUntil ? null : $user.blockedUntil
        /* Enhanced User Block System [E] */

        if (first) $user = { money: 0 }
        if (black == "null") black = false
        if (black == "chat") {
          black = false
          this.noChat = true
        }

        this.exordial = $user.exordial || ""
        this.equip = $user.equip || {}
        this.box = $user.box || {}
        this.data = new Data($user.kkutu)
        this.money = Number($user.money)
        this.friends = $user.friends || {}
        if (first) this.flush()
        else {
          this.checkExpire()
          this.okgCount = Math.floor((this.data.playTime || 0) / PER_OKG)
        }
        /* Enhanced User Block System [S] */
        if (black) {
          if (blockedUntil)
            R.go({ result: 444, black: black, blockedUntil: blockedUntil })
          else R.go({ result: 444, black: black })
        } else if (cluster.isPrimary && $user.server)
          /* Enhanced User Block System [E] */
          R.go({ result: 409, black: $user.server })
        else if (exports.NIGHT && this.isAjae === false) R.go({ result: 440 })
        else R.go({ result: 200 })
      })
    return R
  }

  flush(box?: boolean, equip?: boolean, friends?: boolean) {
    var R = new Tail()

    if (this.guest) {
      R.go({ id: this.id, prev: 0 })
      return R
    }
    DB.users
      .upsert(["_id", this.id])
      .set(
        !isNaN(this.money) ? ["money", this.money] : undefined,
        this.data && !isNaN(this.data.score) ? ["kkutu", this.data] : undefined,
        box ? ["box", this.box] : undefined,
        equip ? ["equip", this.equip] : undefined,
        friends ? ["friends", this.friends] : undefined
      )
      .on((__res) => {
        DB.redis.getGlobal(this.id).then((_res) => {
          DB.redis.putGlobal(this.id, this.data.score).then((res) => {
            logger.info(
              `FLUSHED [${this.id}] PTS=${this.data.score} MNY=${this.money}`
            )
            R.go({ id: this.id, prev: _res })
          })
        })
      })
    return R
  }

  invokeWordPiece(text, coef) {
    if (!this.game.wpc) return
    var v

    if (Math.random() <= 0.04 * coef) {
      v = text.charAt(Math.floor(Math.random() * text.length))
      if (!v.match(/[a-z가-힣]/)) return
      this.game.wpc.push(v)
    }
  }

  enter(room, spec, pass) {
    var $room, i

    if (this.place) {
      this.send("roomStuck")
      logger.warn(
        `Enter the room ${room.id} in the place ${this.place} by ${this.id}!`
      )
      return
    } else if (room.id) {
      // 이미 있는 방에 들어가기... 여기서 유효성을 검사한다.
      $room = ROOM[room.id]

      if (!$room) {
        if (cluster.isPrimary) {
          for (i in CHAN) CHAN[i].send({ type: "room-invalid", room: room })
        } else {
          process.send({ type: "room-invalid", room: room })
        }
        return this.sendError(430, room.id)
      }
      if (!spec) {
        if ($room.gaming) {
          return this.send("error", { code: 416, target: $room.id })
        } else if (this.guest)
          if (!GUEST_PERMISSION.enter) {
            return this.sendError(401)
          }
      }
      if ($room.players.length >= $room.limit + (spec ? MAX_OBSERVER : 0)) {
        return this.sendError(429)
      }
      if ($room.players.indexOf(this.id) != -1) {
        return this.sendError(409)
      }
      if (cluster.isPrimary) {
        this.send("preRoom", {
          id: $room.id,
          pw: room.password,
          channel: $room.channel,
        })
        CHAN[$room.channel].send({
          type: "room-reserve",
          session: this.sid,
          room: room,
          spec: spec,
          pass: pass,
        })

        $room = undefined
      } else {
        if (!pass && $room) {
          if ($room.kicked.indexOf(this.id) != -1) {
            return this.sendError(406)
          }
          if ($room.password != room.password && $room.password) {
            $room = undefined
            return this.sendError(403)
          }
        }
      }
    } else if (this.guest && !GUEST_PERMISSION.enter) {
      this.sendError(401)
    } else {
      // 새 방 만들어 들어가기
      /*
				1. 마스터가 ID와 채널을 클라이언트로 보낸다.
				2. 클라이언트가 그 채널 일꾼으로 접속한다.
				3. 일꾼이 만든다.
				4. 일꾼이 만들었다고 마스터에게 알린다.
				5. 마스터가 방 정보를 반영한다.
			*/
      if (cluster.isPrimary) {
        var av = getFreeChannel()

        room.id = _rid
        room._create = true
        this.send("preRoom", { id: _rid, channel: av })
        CHAN[av].send({
          type: "room-reserve",
          create: true,
          session: this.sid,
          room: room,
        })

        do {
          if (++_rid > 999) _rid = 100
        } while (ROOM[_rid])
      } else {
        if (room._id) {
          room.id = room._id
          delete room._id
        }
        if (this.place != 0) {
          this.sendError(409)
        }
        $room = new exports.Room(room, getFreeChannel())

        process.send({
          type: "room-new",
          target: this.id,
          room: $room.getData(),
        })
        ROOM[$room.id] = $room
        spec = false
      }
    }
    if ($room) {
      if (spec) $room.spectate(this, room.password)
      else $room.come(this, room.password, pass)
    }
  }

  leave(kickVote) {
    var $room = ROOM[this.place]

    if (this.subPlace) {
      this.pracRoom.go(this)
      if ($room) this.send("room", { target: this.id, room: $room.getData() })
      this.publish("user", this.getData())
      if (!kickVote) return
    }
    if ($room) $room.go(this, kickVote)
  }

  setForm(mode) {
    var $room = ROOM[this.place]

    if (!$room) return

    this.form = mode
    this.ready = false
    this.publish("user", this.getData())
  }

  setTeam(team) {
    this.team = team
    this.publish("user", this.getData())
  }

  kick(target, kickVote) {
    var $room = ROOM[this.place]
    var len = $room.players.length

    if (target == null) {
      // 로봇 (이 경우 kickVote는 로봇의 식별자)
      $room.removeAI(kickVote)
      return
    }
    for (const i in $room.players) {
      if ($room.players[i].robot) len--
    }
    if (len < 4) kickVote = { target: target, Y: 1, N: 0 }
    if (kickVote) {
      $room.kicked.push(target)
      $room.kickVote = null
      if (DIC[target]) DIC[target].leave(kickVote)
    } else {
      $room.kickVote = { target: target, Y: 1, N: 0, list: [] }
      for (const i in $room.players) {
        const $c = DIC[$room.players[i]]
        if (!$c) continue
        if ($c.id == $room.master) continue

        // TODO: 임시 Promise (나중에 수정 필요)
        const kickVoteAfter10Sec = async () => {
          await new Promise((resolve) => setTimeout(resolve, 10000))
          $c.kickVote($c, true)
        }
        kickVoteAfter10Sec().then()
      }
      this.publish("kickVote", $room.kickVote, true)
    }
  }

  kickVote(client, agree) {
    var $room = ROOM[client.place]
    var $m

    if (!$room) return

    $m = DIC[$room.master]
    if ($room.kickVote) {
      $room.kickVote[agree ? "Y" : "N"]++
      if ($room.kickVote.list.push(client.id) >= $room.players.length - 2) {
        if ($room.gaming) return

        if ($room.kickVote.Y >= $room.kickVote.N)
          $m.kick($room.kickVote.target, $room.kickVote)
        else
          $m.publish(
            "kickDeny",
            {
              target: $room.kickVote.target,
              Y: $room.kickVote.Y,
              N: $room.kickVote.N,
            },
            true
          )

        $room.kickVote = null
      }
    }
    clearTimeout(client.kickTimer)
  }

  toggle() {
    var $room = ROOM[this.place]

    if (!$room) return
    if ($room.master == this.id) return
    if (this.form != "J") return

    this.ready = !this.ready
    this.publish("user", this.getData())
  }

  start() {
    const $room = ROOM[this.place]

    if (!$room) return logger.warn("방이 없는데 start 요청함")
    if ($room.master != this.id)
      return logger.warn("방 주인이 아닌 사람의 start 요청")

    // 혼자서 게임 시작 버튼을 누른 경우
    if ($room.players.length < 2) return this.sendError(411)

    $room.ready()
  }

  practice(level) {
    var $room = ROOM[this.place]
    var ud
    var pr

    if (!$room) return
    if (this.subPlace) return
    if (this.form != "J") return

    this.team = 0
    this.ready = false
    ud = this.getData()
    this.pracRoom = new exports.Room($room.getData())
    this.pracRoom.id = $room.id + 1000
    ud.game.practice = this.pracRoom.id
    if ((pr = $room.preReady())) return this.sendError(pr)
    this.publish("user", ud)
    this.pracRoom.time /= this.pracRoom.rule.time
    this.pracRoom.limit = 1
    this.pracRoom.password = ""
    this.pracRoom.practice = true
    this.subPlace = this.pracRoom.id
    this.pracRoom.come(this)
    this.pracRoom.start(level)
    this.pracRoom.game.hum = 1
  }

  setRoom(room) {
    var $room = ROOM[this.place]

    if ($room) {
      if (!$room.gaming) {
        if ($room.master == this.id) {
          $room.set(room)
          exports.publish(
            "room",
            { target: this.id, room: $room.getData(), modify: true },
            room.password
          )
        } else {
          this.sendError(400)
        }
      }
    } else {
      this.sendError(400)
    }
  }

  applyEquipOptions(rw) {
    var $obj
    var i, j
    var pm = rw.playTime / 60000

    rw._score = Math.round(rw.score)
    rw._money = Math.round(rw.money)
    rw._blog = []
    this.checkExpire()
    for (i in this.equip) {
      $obj = SHOP[this.equip[i]]
      if (!$obj) continue
      if (!$obj.options) continue
      for (j in $obj.options) {
        if (j == "gEXP") rw.score += rw._score * $obj.options[j]
        else if (j == "hEXP") rw.score += $obj.options[j] * pm
        else if (j == "gMNY") rw.money += rw._money * $obj.options[j]
        else if (j == "hMNY") rw.money += $obj.options[j] * pm
        else continue
        rw._blog.push("q" + j + $obj.options[j])
      }
    }
    if (rw.together && this.okgCount > 0) {
      i = 0.05 * this.okgCount
      j = 0.05 * this.okgCount

      rw.score += rw._score * i
      rw.money += rw._money * j
      rw._blog.push("kgEXP" + i)
      rw._blog.push("kgMNY" + j)
    }
    rw.score = Math.round(rw.score)
    rw.money = Math.round(rw.money)
  }

  obtain(k, q, flush) {
    if (this.guest) return
    if (this.box[k]) this.box[k] += q
    else this.box[k] = q

    this.send("obtain", { key: k, q: q })
    if (flush) this.flush(true)
  }

  addFriend(id) {
    var fd = DIC[id]

    if (!fd) return
    this.friends[id] = fd.profile.title || fd.profile.name
    this.flush(false, false, true)
    this.send("friendEdit", { friends: this.friends })
  }

  removeFriend(id) {
    DB.users
      .findOne(["_id", id])
      .limit(["friends", true])
      .on(($doc) => {
        if (!$doc) return

        var f = $doc.friends

        delete f[this.id]
        DB.users.update(["_id", id]).set(["friends", f]).on()
      })
    delete this.friends[id]
    this.flush(false, false, true)
    this.send("friendEdit", { friends: this.friends })
  }
}

export class Room {
  id: number

  opts = {} as any

  master: string = null
  tail = []
  players: any[] = [] // Array<number | Robot> 또는 Record<number | Robot>
  kicked = []
  kickVote = null

  gaming = false
  game = {} as any

  title: string
  password: string
  limit: number
  mode: number
  round: number
  time: number
  practice: number

  rule: any
  _avTeam: any[]
  _teams: any[][]

  gameData?: Game

  constructor(room: { id: number }, public channel) {
    this.id = room.id || _rid
    this.set(room)
  }

  getData() {
    var readies = {}
    var pls = []
    var seq = this.game.seq ? this.game.seq.map(filterRobot) : []
    var o

    for (const i in this.players) {
      if ((o = DIC[this.players[i]])) {
        readies[this.players[i]] = {
          r: o.ready || o.game.ready,
          f: o.form || o.game.form,
          t: o.team || o.game.team,
        }
      }
      pls.push(filterRobot(this.players[i]))
    }
    return {
      id: this.id,
      channel: this.channel,
      title: this.title,
      password: !!this.password,
      limit: this.limit,
      mode: this.mode,
      round: this.round,
      time: this.time,
      master: this.master,
      players: pls,
      readies: readies,
      gaming: this.gaming,
      game: {
        round: this.game.round,
        turn: this.game.turn,
        seq: seq,
        title: this.game.title,
        mission: this.game.mission,
      },
      practice: !!this.practice,
      opts: this.opts,
    }
  }

  addAI(caller) {
    if (this.players.length >= this.limit) return caller.sendError(429)
    if (this.gaming) return caller.send("error", { code: 416, target: this.id })
    if (!this.rule.ai) return caller.sendError(415)

    this.players.push(new Robot(null, this.id, 2))
    this.export()
  }

  setAI(target: number, level: number, team: number) {
    for (const i in this.players) {
      if (!this.players[i]) continue
      if (!this.players[i].robot) continue
      if (this.players[i].id == target) {
        this.players[i].setLevel(level)
        this.players[i].setTeam(team)
        this.export()
        return true
      }
    }
    return false
  }

  removeAI(target: number, noEx?: boolean) {
    let j: number

    for (const i in this.players) {
      if (!this.players[i]) continue
      if (!this.players[i].robot) continue

      // 참고: 아래는 Robot이 아닌 경우이므로 this.players[i]가 number이다.
      if (!target || this.players[i].id == target) {
        if (this.gaming) {
          const j = this.game.seq.indexOf(this.players[i])
          if (j != -1) this.game.seq.splice(j, 1)
        }

        // TODO: 아래의 Number()는 임시로, 타입이 확정되면 없애두자.
        this.players.splice(Number(i), 1)
        if (!noEx) this.export()
        return true
      }
    }
    return false
  }

  come(client: Client) {
    if (!this.practice) client.place = this.id

    if (this.players.push(client.id) == 1) {
      this.master = client.id
    }

    if (cluster.isWorker) {
      client.ready = false
      client.team = 0
      client.cameWhenGaming = false
      client.form = "J"

      if (!this.practice)
        process.send({ type: "room-come", target: client.id, id: this.id })
      this.export(client.id)
    }
  }

  spectate(client, password) {
    if (!this.practice) client.place = this.id
    var len = this.players.push(client.id)

    if (cluster.isWorker) {
      client.ready = false
      client.team = 0
      client.cameWhenGaming = true
      client.form = len > this.limit ? "O" : "S"

      process.send({
        type: "room-spectate",
        target: client.id,
        id: this.id,
        pw: password,
      })
      this.export(client.id, false, true)
    }
  }

  go(client, kickVote?) {
    var x = this.players.indexOf(client.id)
    var me

    if (x == -1) {
      client.place = 0
      if (this.players.length < 1) delete ROOM[this.id]
      return client.sendError(409)
    }
    this.players.splice(x, 1)
    client.game = {}
    if (client.id == this.master) {
      // TODO: 원래는 target이 false이었는데, 타입의 일관성을 위해 0으로 바꿈. (비직관적이므로 개선 필요)
      while (this.removeAI(0, true));
      this.master = this.players[0]
    }
    if (DIC[this.master]) {
      DIC[this.master].ready = false
      if (this.gaming) {
        x = this.game.seq.indexOf(client.id)
        if (x != -1) {
          if (this.game.seq.length <= 2) {
            this.game.seq.splice(x, 1)
            this.roundEnd()
          } else {
            me = this.game.turn == x
            if (me && this.rule.ewq) {
              clearTimeout(this.game._rrt)
              this.game.loading = false
              if (cluster.isWorker) this.turnEnd()
            }
            this.game.seq.splice(x, 1)
            if (this.game.turn > x) {
              this.game.turn--
              if (this.game.turn < 0) this.game.turn = this.game.seq.length - 1
            }
            if (this.game.turn >= this.game.seq.length) this.game.turn = 0
          }
        }
      }
    } else {
      if (this.gaming) {
        this.interrupt()
        this.game.late = true

        logger.debug("Game End! on Room.go()")
        this.gaming = false
        this.game = {}
      }
      delete ROOM[this.id]
    }
    if (this.practice) {
      clearTimeout(this.game.turnTimer)
      client.subPlace = 0
    } else client.place = 0

    if (cluster.isWorker) {
      if (!this.practice) {
        client.socket.close()
        process.send({
          type: "room-go",
          target: client.id,
          id: this.id,
          removed: !ROOM.hasOwnProperty(this.id),
        })
      }
      this.export(client.id, kickVote)
    }
  }

  set(room) {
    var k, ijc, ij

    this.title = room.title
    this.password = room.password
    this.limit = Math.max(
      Math.min(8, this.players.length),
      Math.round(room.limit)
    )
    this.mode = room.mode
    this.rule = getRule(room.mode)
    this.round = Math.round(room.round)
    this.time = room.time * this.rule.time
    if (room.opts && this.opts) {
      for (const i in OPTIONS) {
        k = OPTIONS[i].name.toLowerCase()
        this.opts[k] = room.opts[k] && this.rule.opts.includes(i)
      }
      if ((ijc = this.rule.opts.includes("ijp"))) {
        ij = require("../const")[`${this.rule.lang.toUpperCase()}_IJP`]
        this.opts.injpick = (room.opts.injpick || []).filter(function (item) {
          return ij.includes(item)
        })
      } else this.opts.injpick = []
    }
    if (!this.rule.ai) {
      // TODO: false -> 0 (임시조치)
      while (this.removeAI(0, true));
    }
    for (const i in this.players) {
      if (DIC[this.players[i]]) DIC[this.players[i]].ready = false
    }
  }

  preReady(teams?) {
    var i,
      j,
      t = 0,
      l = 0
    var avTeam = []

    // 팀 검사
    if (teams) {
      if (teams[0].length) {
        if (
          teams[1].length > 1 ||
          teams[2].length > 1 ||
          teams[3].length > 1 ||
          teams[4].length > 1
        )
          return 418
      } else {
        for (i = 1; i < 5; i++) {
          if ((j = teams[i].length)) {
            if (t) {
              if (t != j) return 418
            } else t = j
            l++
            avTeam.push(i)
          }
        }
        if (l < 2) return 418
        this._avTeam = shuffle(avTeam)
      }
    }
    // 인정픽 검사
    if (!this.rule) return 400
    if (this.rule.opts.includes("ijp")) {
      if (!this.opts.injpick) return 400
      if (!this.opts.injpick.length) return 413
      if (
        !this.opts.injpick.every(function (item) {
          return !IJP_EXCEPT.includes(item)
        })
      )
        return 414
    }
    return false
  }

  ready() {
    var i,
      all = true
    var len = 0
    var teams = [[], [], [], [], []]

    for (i in this.players) {
      if (this.players[i].robot) {
        len++
        teams[this.players[i].game.team].push(this.players[i])
        continue
      }
      if (!DIC[this.players[i]]) continue
      if (DIC[this.players[i]].form == "S") continue

      len++
      teams[DIC[this.players[i]].team].push(this.players[i])

      if (this.players[i] == this.master) continue
      if (!DIC[this.players[i]].ready) {
        all = false
        break
      }
    }
    if (!DIC[this.master]) return logger.error("DIC[this.master] is undefined")
    if (len < 2) return DIC[this.master].sendError(411)
    if ((i = this.preReady(teams))) return DIC[this.master].sendError(i)
    if (all) {
      this._teams = teams
      this.start()
    } else DIC[this.master].sendError(412)
  }

  loadGame() {
    const _Game = Rule[this.rule.rule]
    this.gameData = new _Game(this, DB, DIC)
  }

  async start(pracLevel?: number) {
    var i,
      j,
      o,
      hum = 0
    var now = new Date().getTime()

    logger.debug("Game Start")

    // 신기술
    this.loadGame()
    this.gaming = true
    logger.debug("DEBUG", this.gaming)
    this.game.late = true
    this.game.round = 0
    this.game.turn = 0
    this.game.seq = []
    this.game.robots = []
    if (this.practice) {
      this.game.robots.push((o = new Robot(this.master, this.id, pracLevel)))
      this.game.seq.push(o, this.master)
    } else {
      for (i in this.players) {
        if (this.players[i].robot) {
          this.game.robots.push(this.players[i])
        } else {
          if (!(o = DIC[this.players[i]])) continue
          if (o.form != "J") continue
          hum++
        }
        if (this.players[i]) this.game.seq.push(this.players[i])
      }
      if (this._avTeam) {
        o = this.game.seq.length
        j = this._avTeam.length
        this.game.seq = []
        for (i = 0; i < o; i++) {
          var v = this._teams[this._avTeam[i % j]].shift()

          if (!v) continue
          this.game.seq[i] = v
        }
      } else {
        this.game.seq = shuffle(this.game.seq)
      }
    }
    this.game.mission = null
    for (i in this.game.seq) {
      o = DIC[this.game.seq[i]] || this.game.seq[i]
      if (!o) continue
      if (!o.game) continue

      o.playAt = now
      o.ready = false
      o.game.score = 0
      o.game.bonus = 0
      o.game.item = [
        /*0, 0, 0, 0, 0, 0*/
      ]
      o.game.wpc = []
    }
    this.game.hum = hum
    this.getTitle().then((title) => {
      this.game.title = title
      this.export()
      logger.debug("DEBUG3", this.gaming)

      // TODO: 임시 Promise (나중에 수정 필요)
      const roundReadyAfter2Sec = async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        this.roundReady()
      }
      roundReadyAfter2Sec().then()
    })
    logger.debug("DEBUG2", this.gaming)
    this.byMaster("starting", { target: this.id })
    delete this._avTeam
    delete this._teams
  }

  roundReady() {
    // TODO: if (this.gaming) return this.route("roundReady")
    logger.debug("DEBUG4", this.gaming)
    if (!this.gaming) return logger.warn("roundReady: this.gaming is false")
    // return 없앴는데 괜찮겠지?
    this.gameData.roundReady().then()
  }

  interrupt() {
    clearTimeout(this.game._rrt)
    clearTimeout(this.game.turnTimer)
    clearTimeout(this.game.hintTimer)
    clearTimeout(this.game.hintTimer2)
    clearTimeout(this.game.qTimer)
  }

  roundEnd(data?: any) {
    var o, rw
    const res: {
      id: string
      score: number
      dim: number
      rank?: number
      reward?: any
    }[] = []
    var users = {}
    var rl
    var pv = -1
    var suv = []
    var teams = [null, [], [], [], []]
    var sumScore = 0
    var now = new Date().getTime()

    this.interrupt()
    for (const i in this.players) {
      o = DIC[this.players[i]]
      if (!o) continue
      if (o.cameWhenGaming) {
        o.cameWhenGaming = false
        if (o.form == "O") {
          o.sendError(428)
          o.leave()
          continue
        }
        o.setForm("J")
      }
    }
    for (const i in this.game.seq) {
      o = DIC[this.game.seq[i]] || this.game.seq[i]
      if (!o) continue
      if (o.robot) {
        if (o.game.team) teams[o.game.team].push(o.game.score)
      } else if (o.team) teams[o.team].push(o.game.score)
    }
    for (let i = 1; i < 5; i++)
      if ((o = teams[i].length))
        teams[i] = [
          o,
          teams[i].reduce(function (p, item) {
            return p + item
          }, 0),
        ]
    for (const i in this.game.seq) {
      o = DIC[this.game.seq[i]]
      if (!o) continue
      sumScore += o.game.score
      res.push({
        id: o.id,
        score: o.team ? teams[o.team][1] : o.game.score,
        dim: o.team ? teams[o.team][0] : 1,
      })
    }
    res.sort(function (a, b) {
      return b.score - a.score
    })
    rl = res.length

    for (const i in res) {
      o = DIC[res[i].id]
      if (pv == res[i].score) {
        res[i].rank = res[Number(i) - 1].rank
      } else {
        res[i].rank = Number(i)
      }
      pv = res[i].score
      rw = getRewards(
        this.mode,
        o.game.score / res[i].dim,
        o.game.bonus,
        res[i].rank,
        rl,
        sumScore
      )
      rw.playTime = now - o.playAt
      o.applyEquipOptions(rw) // 착용 아이템 보너스 적용
      if (rw.together) {
        if (o.game.wpc)
          o.game.wpc.forEach(function (item) {
            o.obtain("$WPC" + item, 1)
          }) // 글자 조각 획득 처리
        o.onOKG(rw.playTime)
      }
      res[i].reward = rw
      o.data.score += rw.score || 0
      o.money += rw.money || 0
      o.data.record[GAME_TYPE[this.mode]][2] += rw.score || 0
      o.data.record[GAME_TYPE[this.mode]][3] += rw.playTime
      if (!this.practice && rw.together) {
        o.data.record[GAME_TYPE[this.mode]][0]++
        if (res[i].rank == 0) o.data.record[GAME_TYPE[this.mode]][1]++
      }
      users[o.id] = o.getData()

      suv.push(o.flush(true))
    }
    all(suv).then((uds) => {
      var o = {}

      suv = []
      for (const i in uds) {
        o[uds[i].id] = { prev: uds[i].prev }
        suv.push(DB.redis.getSurround(uds[i].id))
      }
      all(suv).then((ranks) => {
        for (const i in ranks) {
          if (!o[ranks[i].target]) continue

          o[ranks[i].target].list = ranks[i].data
        }
        this.byMaster(
          "roundEnd",
          { result: res, users: users, ranks: o, data: data },
          true
        )
      })
    })
    logger.debug("Game End! on Room.roundEnd()")
    this.gaming = false
    this.export()
    delete this.game.seq
    delete this.game.wordLength
    delete this.game.dic
  }

  byMaster(type, data, noBlock?: boolean) {
    logger.debug("byMaster", type, data)

    if (!DIC[this.master])
      logger.warn("Master가 아닌 클라이언트의 byMaster 호출")

    DIC[this.master].publish(type, data, noBlock)
  }

  export(target?: string, kickVote?: boolean, spec?: boolean) {
    var obj: {
      room: any
      target?: any
      kickVote?: any
      chain?: any
      theme?: any
      conso?: any
      prisoners?: any
      boards?: any
      means?: any
      spec?: any
    } = { room: this.getData() }
    var o

    if (!this.rule) return logger.warn("no this.rule")
    if (target) obj.target = target
    if (kickVote) obj.kickVote = kickVote
    if (spec && this.gaming) {
      if (this.rule.rule == "Classic") {
        if (this.game.chain) obj.chain = this.game.chain.length
      } else if (this.rule.rule == "Jaqwi") {
        obj.theme = this.game.theme
        obj.conso = this.game.conso
      } else if (this.rule.rule == "Crossword") {
        obj.prisoners = this.game.prisoners
        obj.boards = this.game.boards
        obj.means = this.game.means
      }
      obj.spec = {}
      for (const i in this.game.seq) {
        if ((o = DIC[this.game.seq[i]])) obj.spec[o.id] = o.game.score
      }
    }
    if (this.practice) {
      if (DIC[this.master || target])
        DIC[this.master || target].send("room", obj)
    } else {
      exports.publish("room", obj, this.password)
    }
  }

  turnStart(force?) {
    if (!this.gaming) return logger.warn("turnStart: not gaming", this.gaming)
    return this.gameData.turnStart(force).then()
  }

  readyRobot(robot: Robot) {
    if (!this.gaming) return logger.warn("readyRobot: not gaming")
    return this.gameData.readyRobot(robot).then()
  }

  turnRobot(robot, text, data?) {
    if (!this.gaming) return logger.warn("turnRobot: not gaming")
    this.submit(robot, text, data)
    //return this.route("turnRobot", robot, text);
  }

  turnNext(force?) {
    if (!this.gaming) return logger.warn("turnNext: not gaming")
    if (!this.game.seq) return logger.warn("turnNext: no seq")

    this.game.turn = (this.game.turn + 1) % this.game.seq.length
    this.turnStart(force)
  }

  turnEnd() {
    this.gameData.turnEnd().then()
  }

  submit(client, text, data) {
    this.gameData.submit(client, text, data).then()
  }

  getScore(text, delay, ignoreMission?: boolean) {
    return this.gameData.getScore(text, delay, ignoreMission)
  }

  getTurnSpeed(rt) {
    if (rt < 5000) return 10
    else if (rt < 11000) return 9
    else if (rt < 18000) return 8
    else if (rt < 26000) return 7
    else if (rt < 35000) return 6
    else if (rt < 45000) return 5
    else if (rt < 56000) return 4
    else if (rt < 68000) return 3
    else if (rt < 81000) return 2
    else if (rt < 95000) return 1
    else return 0
  }

  getTitle() {
    return this.gameData.getTitle()
  }

  checkRoute(func: string): undefined | any {
    // c는 해당 게임의 js (결국은 Object이긴 한데...)
    const c = Rule[this.rule.rule]

    if (!this.rule) {
      logger.warn("Unknown mode: " + this.mode)
      return
    }
    if (!c) {
      logger.warn("Unknown rule: " + this.rule.rule)
      return
    }
    if (!c[func]) {
      logger.warn("Unknown function: " + func)
      return
    }

    // 각 게임의 오브젝트(js파일 자체)에서 불러옴
    return c[func]
  }
}

function getFreeChannel() {
  var i,
    list = {}

  if (cluster.isPrimary) {
    var mk = 1

    for (i in CHAN) {
      // if(CHAN[i].isDead()) continue;
      list[i] = 0
    }
    for (i in ROOM) {
      // if(!list.hasOwnProperty(i)) continue;
      mk = ROOM[i].channel
      list[mk]++
    }
    for (i in list) {
      if (list[i] < list[mk]) mk = i
    }
    return Number(mk)
  } else {
    return channel || 0
  }
}

function getGuestName(sid) {
  var i,
    len = sid.length,
    res = 0

  for (i = 0; i < len; i++) {
    res += sid.charCodeAt(i) * (i + 1)
  }
  return "GUEST" + (1000 + (res % 9000))
}
function shuffle(arr) {
  var i,
    r = []

  for (i in arr) r.push(arr[i])
  r.sort(() => {
    return Math.random() - 0.5
  })

  return r
}
function getRewards(mode, score, bonus, rank, all, ss) {
  var rw = { score: 0, money: 0, together: false }
  var sr = score / ss

  // all은 1~8
  // rank는 0~7
  switch (GAME_TYPE[mode]) {
    case "EKT":
      rw.score += score * 1.4
      break
    case "ESH":
      rw.score += score * 0.5
      break
    case "KKT":
      rw.score += score * 1.42
      break
    case "KSH":
      rw.score += score * 0.55
      break
    case "CSQ":
      rw.score += score * 0.4
      break
    case "KCW":
      rw.score += score * 1.0
      break
    case "KTY":
      rw.score += score * 0.3
      break
    case "ETY":
      rw.score += score * 0.37
      break
    case "KAP":
      rw.score += score * 0.8
      break
    case "HUN":
      rw.score += score * 0.5
      break
    case "KDA":
      rw.score += score * 0.57
      break
    case "EDA":
      rw.score += score * 0.65
      break
    case "KSS":
      rw.score += score * 0.5
      break
    case "ESS":
      rw.score += score * 0.22
      break
    default:
      break
  }
  rw.score =
    (rw.score *
      (0.77 + 0.05 * (all - rank) * (all - rank)) * // 순위
      1.25) /
    (1 + 1.25 * sr * sr) // 점차비(양학했을 수록 ↓)
  rw.money = 1 + rw.score * 0.01
  if (all < 2) {
    rw.score = rw.score * 0.05
    rw.money = rw.money * 0.05
  } else {
    rw.together = true
  }
  rw.score += bonus
  rw.score = rw.score || 0
  rw.money = rw.money || 0

  // applyEquipOptions에서 반올림한다.
  return rw
}
function filterRobot(item) {
  if (!item) return {}
  return item.robot && item.getData ? item.getData() : item
}
