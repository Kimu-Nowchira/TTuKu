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

import {
  getPenalty,
  getPreScore,
  KOR_FLAG,
  KOR_GROUP,
  KOR_STRICT,
} from "../../const"
import { Game } from "./index"
import Room from "../classes/Room"
import { Tail } from "../../sub/lizard"
import { kkutu } from "../../Web/db"

const ROBOT_START_DELAY = [1200, 800, 400, 200, 0]
const ROBOT_TYPE_COEF = [1250, 750, 500, 250, 0]
const ROBOT_THINK_COEF = [4, 2, 1, 0, 0]
const ROBOT_HIT_LIMIT = [8, 4, 2, 1, 0]

// ㄱ, ㄴ, ㄷ, ㅁ, ㅂ, ㅅ, ㅇ, ㅈ, ㅊ, ㅌ, ㅍ, ㅎ
const HUNMIN_LIST = [
  4352, 4354, 4355, 4358, 4359, 4361, 4363, 4364, 4366, 4368, 4369, 4370,
]

export default class Hunmin extends Game {
  getTitle() {
    const R = new Tail()

    this.room.game.done = []
    setTimeout(() => {
      R.go("①②③④⑤⑥⑦⑧⑨⑩")
    }, 500)
    return R
  }

  async roundReady() {
    clearTimeout(this.room.game.turnTimer)
    this.room.game.round++
    this.room.game.roundTime = this.room.time * 1000
    if (this.room.game.round <= this.room.round) {
      this.room.game.theme = getTheme(2, this.room.game.done)
      this.room.game.chain = []
      if (this.room.opts.mission)
        this.room.game.mission = getMission(this.room.game.theme)
      this.room.game.done.push(this.room.game.theme)
      this.room.byMaster(
        "roundReady",
        {
          round: this.room.game.round,
          theme: this.room.game.theme,
          mission: this.room.game.mission,
        },
        true
      )

      await new Promise(
        (resolve) => (this.room.game.turnTimer = setTimeout(resolve, 2400))
      )
      this.room.turnStart()
    } else {
      this.room.roundEnd()
    }
  }

  async turnStart(force) {
    if (!this.room.game.chain) return
    this.room.game.roundTime = Math.min(
      this.room.game.roundTime,
      Math.max(10000, 150000 - this.room.game.chain.length * 1500)
    )

    const speed = this.room.getTurnSpeed(this.room.game.roundTime)

    clearTimeout(this.room.game.turnTimer)
    clearTimeout(this.room.game.robotTimer)
    this.room.game.late = false
    this.room.game.turnTime = 15000 - 1400 * speed
    this.room.game.turnAt = new Date().getTime()
    this.room.byMaster(
      "turnStart",
      {
        turn: this.room.game.turn,
        speed: speed,
        roundTime: this.room.game.roundTime,
        turnTime: this.room.game.turnTime,
        mission: this.room.game.mission,
        seq: force ? this.room.game.seq : undefined,
      },
      true
    )

    const si = this.room.game.seq[this.room.game.turn]
    if (si && si.robot) this.room.readyRobot(si)

    await new Promise(
      (resolve) =>
        (this.room.game.turnTimer = setTimeout(
          resolve,
          Math.min(this.room.game.roundTime, this.room.game.turnTime + 100)
        ))
    )
    this.room.turnEnd()
  }

  async turnEnd() {
    var target =
      this.DIC[this.room.game.seq[this.room.game.turn]] ||
      this.room.game.seq[this.room.game.turn]
    var score

    if (this.room.game.loading) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      this.room.turnEnd()
      return
    }

    if (!this.room.game.theme) return

    this.room.game.late = true
    if (target)
      if (target.game) {
        score = getPenalty(this.room.game.chain, target.game.score)
        target.game.score += score
      }
    getAuto.call(this.room, this.room.game.theme, 0).then((w) => {
      this.room.byMaster(
        "turnEnd",
        {
          ok: false,
          target: target ? target.id : null,
          score: score,
          hint: w,
        },
        true
      )
      // TODO: 임시
      const roundReadyAfter3Sec = async () => {
        await new Promise(
          (resolve) => (this.room.game._rrt = setTimeout(resolve, 3000))
        )
        this.room.roundReady()
      }

      roundReadyAfter3Sec().then()
    })
    clearTimeout(this.room.game.robotTimer)
  }

  async submit(client, text, data) {
    var score,
      l = "ko",
      t
    var tv = new Date().getTime()
    var mgt = this.room.game.seq[this.room.game.turn]

    if (!mgt) return
    if (!mgt.robot) if (mgt != client.id) return
    if (!this.room.game.theme) return
    if (isChainable(text, this.room.game.theme)) {
      if (this.room.game.chain.indexOf(text) == -1) {
        this.room.game.loading = true

        const onDB = async ($doc) => {
          const preApproved = async () => {
            if (this.room.game.late) return
            if (!this.room.game.chain) return

            this.room.game.loading = false
            this.room.game.late = true
            clearTimeout(this.room.game.turnTimer)
            t = tv - this.room.game.turnAt
            score = this.room.getScore(text, t)
            this.room.game.chain.push(text)
            this.room.game.roundTime -= t
            client.game.score += score
            client.publish(
              "turnEnd",
              {
                ok: true,
                value: text,
                mean: $doc.mean,
                theme: $doc.theme,
                wc: $doc.type,
                score: score,
                bonus:
                  this.room.game.mission === true
                    ? score - this.room.getScore(text, t, true)
                    : 0,
              },
              true
            )
            if (this.room.game.mission === true) {
              this.room.game.mission = getMission(this.room.game.theme)
            }

            if (!client.robot) {
              client.invokeWordPiece(text, 1)
            }

            await new Promise((res) =>
              setTimeout(res, this.room.game.turnTime / 6)
            )
            this.room.turnNext()
          }

          const denied = (code = 404) => {
            this.room.game.loading = false
            client.publish("turnError", { code: code, value: text }, true)
          }

          if ($doc) {
            if (!this.room.opts.injeong && $doc.flag & KOR_FLAG.INJEONG)
              denied()
            else if (
              this.room.opts.strict &&
              (!$doc.type.match(KOR_STRICT) || $doc.flag >= 4)
            )
              denied(406)
            else if (this.room.opts.loanword && $doc.flag & KOR_FLAG.LOANWORD)
              denied(405)
            else await preApproved()
          } else {
            denied()
          }
        }
        kkutu[l].findOne(["_id", text], ["type", KOR_GROUP]).on(onDB)
      } else {
        client.publish("turnError", { code: 409, value: text }, true)
      }
    } else {
      client.chat(text)
    }
  }

  getScore(text, delay, ignoreMission) {
    const tr = 1 - delay / this.room.game.turnTime
    let score = getPreScore(text, this.room.game.chain, tr)

    if (!ignoreMission) {
      // @ts-ignore
      const arr = text.match(new RegExp(this.room.game.mission, "g"))
      if (arr) {
        score += score * 0.5 * arr.length
        this.room.game.mission = true
      }
    }
    return Math.round(score)
  }

  async readyRobot(robot) {
    var my = this
    var level = robot.level
    var delay = ROBOT_START_DELAY[level]
    var w, text

    getAuto.call(my, this.room.game.theme, 2).then((list) => {
      if (list.length) {
        list.sort((a, b) => b.hit - a.hit)
        if (ROBOT_HIT_LIMIT[level] > list[0].hit) denied()
        else pickList(list)
      } else denied()
    })

    const denied = () => {
      text = `${this.room.game.theme}... T.T`
      after()
    }

    const pickList = (list) => {
      if (list)
        do {
          if (!(w = list.shift())) break
        } while (false)
      if (w) {
        text = w._id
        delay +=
          (500 * ROBOT_THINK_COEF[level] * Math.random()) /
          Math.log(1.1 + w.hit)
        after()
      } else denied()
    }

    const after = async () => {
      delay += text.length * ROBOT_TYPE_COEF[level]

      await new Promise((res) => setTimeout(res, delay))
      this.room.turnRobot(robot, text)
    }
  }
}

function isChainable(text, theme) {
  return toRegex(theme).exec(text) != null
}

function toRegex(theme) {
  var arg = theme.split("").map(toRegexText).join("")

  return new RegExp(`^(${arg})$`)
}

function toRegexText(item) {
  var c = item.charCodeAt()
  var a = 44032 + 588 * (c - 4352),
    b = a + 587

  return `[\\u${a.toString(16)}-\\u${b.toString(16)}]`
}

function getMission(theme) {
  var flag

  if (!theme) return
  if (Math.random() < 0.5) flag = 0
  else flag = 1

  return String.fromCharCode(44032 + 588 * (theme.charCodeAt(flag) - 4352))
}

function getAuto(theme, type) {
  /* type
		0 무작위 단어 하나
		1 존재 여부
		2 단어 목록
	*/
  const my = this as Room
  var R = new Tail()
  var bool = type == 1

  var aqs: [string, any][] = [["_id", toRegex(theme)]]
  var aft
  var raiser

  if (!my.opts.injeong) aqs.push(["flag", { $nand: KOR_FLAG.INJEONG }])
  if (my.opts.loanword) aqs.push(["flag", { $nand: KOR_FLAG.LOANWORD }])
  if (my.opts.strict) aqs.push(["type", KOR_STRICT], ["flag", { $lte: 3 }])
  else aqs.push(["type", KOR_GROUP])
  if (my.game.chain) aqs.push(["_id", { $nin: my.game.chain }])
  raiser = kkutu[my.rule.lang].find(...aqs).limit(bool ? 1 : 123)
  switch (type) {
    case 0:
    default:
      aft = function ($md) {
        R.go($md[Math.floor(Math.random() * $md.length)])
      }
      break
    case 1:
      aft = function ($md) {
        R.go(!!$md.length)
      }
      break
    case 2:
      aft = function ($md) {
        R.go($md)
      }
      break
  }
  raiser.on(aft)

  return R
}

function getTheme(len, ex) {
  var res = ""
  var c, d

  while (len > 0) {
    c = String.fromCharCode(
      HUNMIN_LIST[Math.floor(Math.random() * HUNMIN_LIST.length)]
    )
    if (ex.includes((d = res + c))) continue
    res = d
    len--
  }
  return res
}
