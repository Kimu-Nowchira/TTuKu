import { logger } from "../../sub/jjlog"
import { WebSocket } from "ws"
import cluster from "node:cluster"

import {
  BLOCKED_LENGTH,
  KICK_BY_SPAM,
  MAX_OBSERVER,
  SPAM_ADD_DELAY,
  SPAM_CLEAR_DELAY,
  SPAM_LIMIT,
} from "../../const"
import Room from "./Room"
import {
  CHAN,
  DIC,
  ROOM,
  SHOP,
  publish,
  GUEST_PERMISSION,
  _rid,
  setRId,
  addRId,
  NIGHT,
  onClientMessage,
  onClientClosed,
} from "../kkutu"
import { ClientExportData, IUser } from "../types"
import Data from "./Data"
import { redis, users } from "../../sub/db"

const channel = Number(process.env["CHANNEL"]) || 0

const GUEST_IMAGE = "/img/kkutu/guest.png"

const MAX_OKG = 18
const PER_OKG = 600000

export default class Client {
  // PlayerExportData
  id: string
  robot = false
  guest = false
  game: Record<string, any> = {}

  // PlayerExportData (때떄로 null로 보내는 거)
  place = 0
  data: Data
  equip: Record<string, any> = {}

  // DB에서 불러온 그 외의 값
  money: number = 0
  exordial: string = ""

  // refresh에서 처리하는 값
  noChat: boolean = false
  okgCount: number

  team = 0
  ready = false

  subPlace = 0
  error = false
  blocked = false
  spam = 0
  _pub = Date.now()

  isAjae: boolean

  pracRoom: Room

  form: string
  numSpam: any

  box: any = {}
  friends: Record<string, string> = {}

  cameWhenGaming: boolean

  playAt: number

  passRecaptcha: boolean
  admin: boolean
  remoteAddress: string
  _error: number
  _invited: boolean

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
      // const gp = guestProfiles[Math.floor(Math.random() * guestProfiles.length)]

      this.id = "guest__" + sid
      this.guest = true
      this.isAjae = false
      this.profile = {
        id: sid,
        title: getGuestName(sid),
        image: GUEST_IMAGE,
      }
    }

    socket.on("close", () => {
      if (ROOM[this.place]) ROOM[this.place].go(this)
      if (this.subPlace) this.pracRoom.go(this)

      // code를 보내지만 쓰지 않아서 없애 둠 (리스너에서 받음)
      // onClientClosed(this, code)
      onClientClosed(this)
    })

    socket.on("message", (msg: any) => {
      let data
      // const room = ROOM[this.place]
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

      onClientMessage(this, data)
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

  getData(gaming: boolean = false): ClientExportData {
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
      robot: false,
    }
  }

  send(type: string, data: any = {}) {
    if (this.socket.readyState == 1)
      this.socket.send(JSON.stringify({ ...data, type }))
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

    const expired: string[] = []

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
        let gr = SHOP[i].group

        if (gr.substring(0, 3) === "BDG") gr = "BDG"
        if (this.equip[gr] === i) delete this.equip[gr]
        delete this.box[i]
        expired.push(i)
      }
    }

    if (expired.length) {
      this.send("expired", { list: expired })
      this.flush(this.box, !!this.equip).then()
    }
  }

  async refresh() {
    if (this.guest) {
      this.equip = {}
      this.data = new Data()
      this.money = 0
      this.friends = {}

      return { result: 200 }
    }

    const user = (await users.findOne(["_id", this.id]).onAsync()) as IUser

    let black = ""
    let blockedUntil: number = null

    const userData = user
      ? user
      : {
          money: 0,
          exordial: "",
          equip: undefined,
          box: undefined,
          kkutu: undefined,
          friends: undefined,
        }

    if (user) {
      // 기존 유저의 처벌 관련
      black = user.black
      if (black == "null") black = ""
      if (black == "chat") {
        black = ""
        this.noChat = true
      }
      blockedUntil = user.blockedUntil || null
    }

    if (userData.exordial) this.exordial = userData.exordial
    if (userData.equip) this.equip = userData.equip
    if (userData.box) this.box = userData.box
    if (userData.friends) this.friends = userData.friends

    this.data = new Data(userData.kkutu)
    this.money = Number(userData.money)

    if (!user) this.flush().then()
    else {
      this.checkExpire()
      this.okgCount = Math.floor((this.data.playTime || 0) / PER_OKG)
    }

    /* Enhanced User Block System [S] */
    if (black) {
      if (blockedUntil)
        return { result: 444, black: black, blockedUntil: blockedUntil }
      else return { result: 444, black: black }
    } else if (cluster.isPrimary && user.server) {
      /* Enhanced User Block System [E] */
      return { result: 409, black: user.server }
    } else if (NIGHT && this.isAjae === false) return { result: 440 }
    else return { result: 200 }
  }

  async flush(box?: boolean, equip?: boolean, friends?: boolean) {
    if (this.guest) return { id: this.id, prev: 0 }

    await users
      .upsert(["_id", this.id])
      .set(
        !isNaN(this.money) ? ["money", this.money] : undefined,
        // @ts-ignore 임시로 무시 TODO
        this.data && !isNaN(this.data.score) ? ["kkutu", this.data] : undefined,
        box ? ["box", this.box] : undefined,
        equip ? ["equip", this.equip] : undefined,
        friends ? ["friends", this.friends] : undefined
      )
      .onAsync()

    const res = await redis.getGlobal(this.id)
    await redis.putGlobal(this.id, this.data.score)

    logger.info(`FLUSHED [${this.id}] PTS=${this.data.score} MNY=${this.money}`)
    return { id: this.id, prev: res }
  }

  invokeWordPiece(text, coef) {
    if (!this.game.wpc) return
    let v

    if (Math.random() <= 0.04 * coef) {
      v = text.charAt(Math.floor(Math.random() * text.length))
      if (!v.match(/[a-z가-힣]/)) return
      this.game.wpc.push(v)
    }
  }

  enter(
    room: { id?: number; password?: string; _create?: boolean; _id?: number },
    spec,
    pass?
  ) {
    let $room: Room | undefined

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
          for (const i in CHAN)
            CHAN[i].send({ type: "room-invalid", room: room })
        } else {
          process.send({ type: "room-invalid", room: room })
        }
        return this.sendError(430, room.id.toString())
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

          if ($room.password !== room.password && $room.password)
            return this.sendError(403)
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
        const av = getFreeChannel()

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
          addRId()
          if (_rid > 999) setRId(100)
        } while (ROOM[_rid])
      } else {
        if (room._id) {
          room.id = room._id
          delete room._id
        }
        if (this.place != 0) {
          this.sendError(409)
        }
        $room = new Room(room, getFreeChannel())

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
      // 원래는 $room.come(this, room.password, pass) 인데 뒷 값을 안 받는 것 같아 뺌
      else $room.come(this)
    }
  }

  leave(kickVote?: boolean) {
    const $room = ROOM[this.place]

    if (this.subPlace) {
      this.pracRoom.go(this)
      if ($room) this.send("room", { target: this.id, room: $room.getData() })
      this.publish("user", this.getData())
      if (!kickVote) return
    }
    if ($room) $room.go(this, kickVote)
  }

  setForm(mode) {
    const $room = ROOM[this.place]

    if (!$room) return

    this.form = mode
    this.ready = false
    this.publish("user", this.getData())
  }

  setTeam(team) {
    this.team = team
    this.publish("user", this.getData())
  }

  kick(target, kickVote?) {
    const $room = ROOM[this.place]
    let len = $room.players.length

    if (target === null) {
      // 로봇 (이 경우 kickVote는 로봇의 식별자)
      $room.removeAI(kickVote)
      return
    }

    for (const i in $room.players)
      if (typeof $room.players[i] !== "number") len--

    if (len < 4) kickVote = { target: target, Y: 1, N: 0 }

    if (kickVote) {
      $room.kicked.push(target)
      $room.kickVote = null
      if (DIC[target]) DIC[target].leave(kickVote)
    } else {
      $room.kickVote = { target: target, Y: 1, N: 0, list: [] }

      for (const i in $room.players) {
        const player = $room.players[i]
        if (typeof player !== "number") continue

        const $c = DIC[player]
        if (!$c) continue

        if ($c.id === $room.master) continue

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
    const $room = ROOM[client.place]
    if (!$room) return

    const $m = DIC[$room.master]
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
    const $room = ROOM[this.place]

    if (!$room) return
    if ($room.master == this.id) return
    if (this.form !== "J") return

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
    const $room = ROOM[this.place]

    if (!$room) return
    if (this.subPlace) return
    if (this.form != "J") return

    this.team = 0
    this.ready = false

    const userData = this.getData()
    this.pracRoom = new Room($room.getData())
    this.pracRoom.id = $room.id + 1000
    userData.game.practice = this.pracRoom.id

    const pr = $room.preReady()
    if (pr) return this.sendError(pr)

    this.publish("user", userData)
    this.pracRoom.time /= this.pracRoom.rule.time
    this.pracRoom.limit = 1
    this.pracRoom.password = ""
    this.pracRoom.practice = true
    this.subPlace = this.pracRoom.id
    this.pracRoom.come(this)
    this.pracRoom.game.hum = 1
    this.pracRoom.start(level).then()
  }

  setRoom(room) {
    const $room = ROOM[this.place]

    if ($room) {
      if (!$room.gaming) {
        if ($room.master == this.id) {
          $room.set(room)
          publish(
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
    const pm = rw.playTime / 60000

    rw._score = Math.round(rw.score)
    rw._money = Math.round(rw.money)
    rw._blog = []
    this.checkExpire()
    for (const i in this.equip) {
      const $obj = SHOP[this.equip[i]]
      if (!$obj) continue
      if (!$obj.options) continue

      for (const j in $obj.options) {
        if (j == "gEXP") rw.score += rw._score * $obj.options[j]
        else if (j == "hEXP") rw.score += $obj.options[j] * pm
        else if (j == "gMNY") rw.money += rw._money * $obj.options[j]
        else if (j == "hMNY") rw.money += $obj.options[j] * pm
        else continue
        rw._blog.push("q" + j + $obj.options[j])
      }
    }

    if (rw.together && this.okgCount > 0) {
      const i = 0.05 * this.okgCount
      const j = 0.05 * this.okgCount

      rw.score += rw._score * i
      rw.money += rw._money * j
      rw._blog.push("kgEXP" + i)
      rw._blog.push("kgMNY" + j)
    }

    rw.score = Math.round(rw.score)
    rw.money = Math.round(rw.money)
  }

  obtain(k, q, flush?: boolean) {
    if (this.guest) return
    if (this.box[k]) this.box[k] += q
    else this.box[k] = q

    this.send("obtain", { key: k, q: q })
    if (flush) this.flush(true).then()
  }

  addFriend(id) {
    const fd = DIC[id]

    if (!fd) return
    this.friends[id] = fd.profile.title || fd.profile.name
    this.flush(false, false, true).then()
    this.send("friendEdit", { friends: this.friends })
  }

  removeFriend(id) {
    users
      .findOne(["_id", id])
      .limit(["friends", true])
      .on(($doc) => {
        if (!$doc) return

        const f = $doc.friends

        delete f[this.id]
        users.update(["_id", id]).set(["friends", f]).on()
      })
    delete this.friends[id]
    this.flush(false, false, true).then()
    this.send("friendEdit", { friends: this.friends })
  }
}

const getFreeChannel = (): number => {
  if (!cluster.isPrimary) return channel || 0

  const list: Record<number, number> = {}
  let mk = 1

  for (const i in CHAN) list[i] = 0

  for (const i in ROOM) {
    mk = ROOM[i].channel
    list[mk]++
  }

  for (const i in list) if (list[i] < list[mk]) mk = Number(i)

  return Number(mk)
}

const getGuestName = (sid) => {
  let res = 0

  for (let i = 0; i < sid.length; i++) {
    res += sid.charCodeAt(i) * (i + 1)
  }
  return "GUEST" + (1000 + (res % 9000))
}
