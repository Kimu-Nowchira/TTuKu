import {
  CustomRule,
  EN_IJP,
  GAME_TYPE,
  getRule,
  IGameRule,
  IJP_EXCEPT,
  KO_IJP,
  OPTIONS,
} from "../../const"
import { Crossword, Daneo, Game } from "../games"
import cluster from "node:cluster"
import { logger } from "../../sub/jjlog"
import { all } from "../../sub/lizard"
import { DIC, ROOM, _rid, publish, DB } from "../kkutu"
import { GameData, RoomData, RoomExportData } from "../types"
import Classic from "../games/classic"
import Robot from "./Robot"
import Client from "./Client"

const Rule: Record<string, typeof Game> = {
  Classic: Classic,
  Crossword: Crossword,
  Daneo: Daneo,
}

export default class Room {
  id: number

  opts = {} as any

  // TODO: master: string
  master = null
  tail = []
  players: any[] = [] // Array<number | Robot>
  kicked = []
  kickVote = null

  gaming = false
  game: GameData = {}

  title: string
  password: string
  limit: number
  mode: number
  round: number
  time: number
  practice: number

  rule: IGameRule
  _avTeam: any[]
  _teams: any[][]

  gameData?: Game

  constructor(room: RoomData, public channel?: number) {
    this.id = room.id || _rid
    this.set(room)
  }

  getData(): RoomExportData {
    const readies = {}
    const pls: number[] = []
    const seq = this.game.seq ? this.game.seq.map(filterRobot) : []

    for (const i in this.players) {
      const o = DIC[this.players[i]]
      if (o) {
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
      } as GameData,
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
    const len = this.players.push(client.id)

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

  go(client: Client, kickVote?) {
    let x = this.players.indexOf(client.id)

    if (x == -1) {
      client.place = 0
      if (this.players.length < 1) delete ROOM[this.id]
      return client.sendError(409)
    }
    this.players.splice(x, 1)
    client.game = {}

    if (client.id === this.master) {
      // TODO: 원래는 target이 false이었는데, 타입의 일관성을 위해 0으로 바꿈. (비직관적이므로 개선 필요)
      while (true) {
        if (!this.removeAI(0, true)) break
      }
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
            const me = this.game.turn == x
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
        const k = OPTIONS[i].name.toLowerCase()
        this.opts[k] = room.opts[k] && this.rule.opts.includes(i as CustomRule)
      }

      // 어인정 규칙이 켜져있는 경우
      if (this.rule.opts.includes("ijp")) {
        const ij: string[] = []

        switch (this.rule.lang.toUpperCase()) {
          case "KO":
            ij.push(...KO_IJP)
            break
          case "EN":
            ij.push(...EN_IJP)
        }

        this.opts.injpick = (room.opts.injpick || []).filter(function (item) {
          return ij.includes(item)
        })
      } else this.opts.injpick = []
    }

    if (!this.rule.ai) {
      // TODO: false -> 0 (임시조치)
      // while문이 의미가 없는 것 같아서 제거함
      this.removeAI(0, true)
    }
    for (const i in this.players) {
      if (DIC[this.players[i]]) DIC[this.players[i]].ready = false
    }
  }

  preReady(teams?) {
    let t = 0
    let l = 0
    const avTeam = []

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
        for (let i = 1; i < 5; i++) {
          const j = teams[i].length
          if (j) {
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
    let all = true
    let len = 0
    const teams = [[], [], [], [], []]

    for (const i in this.players) {
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

    const errCode = this.preReady(teams)
    if (errCode !== false) return DIC[this.master].sendError(errCode)

    if (all) {
      this._teams = teams
      this.start().then()
    } else DIC[this.master].sendError(412)
  }

  loadGame() {
    const _Game = Rule[this.rule.rule]
    this.gameData = new _Game(this, DB, DIC)
  }

  async start(pracLevel?: number) {
    let hum = 0
    const now = new Date().getTime()

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
      const o = new Robot(this.master, this.id, pracLevel)
      this.game.robots.push(o)
      this.game.seq.push(o, this.master)
    } else {
      for (const i in this.players) {
        if (this.players[i].robot) {
          this.game.robots.push(this.players[i])
        } else {
          const o = DIC[this.players[i]]
          if (!o) continue
          if (o.form != "J") continue
          hum++
        }
        if (this.players[i]) this.game.seq.push(this.players[i])
      }

      if (this._avTeam) {
        const o: number = this.game.seq.length
        const j = this._avTeam.length
        this.game.seq = []
        for (let i = 0; i < o; i++) {
          const v = this._teams[this._avTeam[i % j]].shift()
          if (!v) continue

          this.game.seq[i] = v
        }
      } else {
        this.game.seq = shuffle(this.game.seq)
      }
    }

    this.game.mission = null

    for (const i in this.game.seq) {
      const o = DIC[this.game.seq[i]] || this.game.seq[i]
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
    if (!this.gaming) return logger.warn("roundReady: this.gaming is false")
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
    let rw
    const res: {
      id: string
      score: number
      dim: number
      rank?: number
      reward?: any
    }[] = []
    const users = {}
    let rl
    let pv = -1
    let suv = []
    const teams = [null, [], [], [], []]
    let sumScore = 0
    const now = new Date().getTime()

    this.interrupt()
    for (const i in this.players) {
      const o = DIC[this.players[i]]
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
      const o = DIC[this.game.seq[i]] || this.game.seq[i]
      if (!o) continue
      if (o.robot) {
        if (o.game.team) teams[o.game.team].push(o.game.score)
      } else if (o.team) teams[o.team].push(o.game.score)
    }

    for (let i = 1; i < 5; i++) {
      const o = teams[i].length
      if (o)
        teams[i] = [
          o,
          teams[i].reduce(function (p, item) {
            return p + item
          }, 0),
        ]
    }

    for (const i in this.game.seq) {
      const o = DIC[this.game.seq[i]]
      if (!o) continue
      sumScore += o.game.score
      res.push({
        id: o.id,
        score: o.team ? teams[o.team][1] : o.game.score,
        dim: o.team ? teams[o.team][0] : 1,
      })
    }

    res.sort((a, b) => b.score - a.score)

    rl = res.length

    for (const i in res) {
      const o = DIC[res[i].id]
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
      const o = {}

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
        // ranks 패킷 없애 둠
        this.byMaster(
          "roundEnd",
          { result: res, users: users, data: data },
          true
        )
      })
    })

    logger.debug("Game End! on Room.roundEnd()")

    this.gaming = false
    delete this.gameData

    this.export()
    delete this.game.seq
    delete this.game.wordLength
    delete this.game.dic
  }

  byMaster(type, data, noBlock?: boolean) {
    if (!DIC[this.master])
      logger.warn("Master가 아닌 클라이언트의 byMaster 호출")

    DIC[this.master].publish(type, data, noBlock)
  }

  export(target?: string, kickVote?: boolean, spec?: boolean) {
    const obj: {
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
        const o = DIC[this.game.seq[i]]
        if (o) obj.spec[o.id] = o.game.score
      }
    }
    if (this.practice) {
      if (DIC[this.master || target])
        DIC[this.master || target].send("room", obj)
    } else {
      publish("room", obj, this.password)
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
}

const filterRobot = (item: any) => {
  if (!item) return {}
  return item.robot && item.getData ? item.getData() : item
}

const shuffle = (arr) => {
  const r = []

  for (const i in arr) r.push(arr[i])
  r.sort(() => {
    return Math.random() - 0.5
  })

  return r
}

function getRewards(mode, score, bonus, rank, all, ss) {
  const rw = { score: 0, money: 0, together: false }
  const sr = score / ss

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
