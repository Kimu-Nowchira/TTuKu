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
import { Game } from "./index"
import { getPenalty, getPreScore, MISSION_en, MISSION_ko } from "../../const"
import { Tail } from "../../sub/lizard"

const ROBOT_START_DELAY = [1200, 800, 400, 200, 0]
const ROBOT_TYPE_COEF = [1250, 750, 500, 250, 0]
const ROBOT_THINK_COEF = [4, 2, 1, 0, 0]
const ROBOT_HIT_LIMIT = [4, 2, 1, 0, 0]

export class Daneo extends Game {
  getTitle() {
    const R = new Tail()

    setTimeout(() => {
      R.go("①②③④⑤⑥⑦⑧⑨⑩")
    }, 500)
    return R
  }

  async roundReady() {
    const ijl = this.room.opts.injpick.length

    clearTimeout(this.room.game.turnTimer)
    this.room.game.round++
    this.room.game.roundTime = this.room.time * 1000
    if (this.room.game.round <= this.room.round) {
      this.room.game.theme =
        this.room.opts.injpick[Math.floor(Math.random() * ijl)]
      this.room.game.chain = []
      if (this.room.opts.mission)
        this.room.game.mission = getMission(this.room.rule.lang)
      this.room.byMaster(
        "roundReady",
        {
          round: this.room.game.round,
          theme: this.room.game.theme,
          mission: this.room.game.mission,
        },
        true
      )
      this.room.game.turnTimer = setTimeout(this.room.turnStart, 2400)
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
    this.room.game.turnTimer = setTimeout(
      this.room.turnEnd,
      Math.min(this.room.game.roundTime, this.room.game.turnTime + 100)
    )

    const si = this.room.game.seq[this.room.game.turn]
    if (si)
      if (si.robot) {
        this.room.readyRobot(si)
      }
  }

  async turnEnd() {
    var target =
      this.DIC[this.room.game.seq[this.room.game.turn]] ||
      this.room.game.seq[this.room.game.turn]
    var score

    if (this.room.game.loading) {
      this.room.game.turnTimer = setTimeout(this.room.turnEnd, 100)
      return
    }
    if (!this.room.game.chain) return

    this.room.game.late = true
    if (target)
      if (target.game) {
        score = getPenalty(this.room.game.chain, target.game.score)
        target.game.score += score
      }
    getAuto.call(this.room, this.room.game.theme, 0).then(function (w) {
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
      this.room.game._rrt = setTimeout(this.room.roundReady, 3000)
    })
    clearTimeout(this.room.game.robotTimer)
  }

  async submit(client, text, data) {
    var score, l, t
    var tv = new Date().getTime()
    var mgt = this.room.game.seq[this.room.game.turn]

    if (!mgt) return
    if (!mgt.robot) if (mgt != client.id) return
    if (!this.room.game.theme) return
    if (this.room.game.chain.indexOf(text) == -1) {
      l = this.room.rule.lang
      this.room.game.loading = true

      const onDB = ($doc) => {
        const preApproved = () => {
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
              baby: $doc.baby,
            },
            true
          )
          if (this.room.game.mission === true) {
            this.room.game.mission = getMission(this.room.rule.lang)
          }
          setTimeout(this.room.turnNext, this.room.game.turnTime / 6)
          if (!client.robot) {
            client.invokeWordPiece(text, 1)
            DB.kkutu[l]
              .update(["_id", text])
              .set(["hit", $doc.hit + 1])
              .on()
          }
        }
        const denied = (code = 404) => {
          this.room.game.loading = false
          client.publish("turnError", { code: code, value: text }, true)
        }
        if ($doc) {
          if ($doc.theme.match(toRegex(this.room.game.theme)) == null)
            denied(407)
          else preApproved()
        } else {
          denied()
        }
      }
      DB.kkutu[l].findOne(["_id", text]).on(onDB)
    } else {
      client.publish("turnError", { code: 409, value: text }, true)
    }
  }

  async readyRobot(robot) {
    var level = robot.level
    var delay = ROBOT_START_DELAY[level]
    var w, text

    getAuto.call(this.room, this.room.game.theme, 2).then((list) => {
      if (list.length) {
        list.sort((a, b) => b.hit - a.hit)
        if (ROBOT_HIT_LIMIT[level] > list[0].hit) denied()
        else pickList(list)
      } else denied()
    })

    const denied = () => {
      text = "... T.T"
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

    const after = () => {
      delay += text.length * ROBOT_TYPE_COEF[level]
      setTimeout(this.room.turnRobot, delay, robot, text)
    }
  }

  getScore(text: string, delay: number, ignoreMission: boolean) {
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
}

function toRegex(theme) {
  return new RegExp(`(^|,)${theme}($|,)`)
}

function getMission(l) {
  var arr = l == "ko" ? MISSION_ko : MISSION_en

  if (!arr) return "-"
  return arr[Math.floor(Math.random() * arr.length)]
}

function getAuto(theme, type) {
  /* type
		0 무작위 단어 하나
		1 존재 여부
		2 단어 목록
	*/
  var my = this
  var R = new Lizard.Tail()
  var bool = type == 1

  const aqs: [string, any][] = [["theme", toRegex(theme)]]
  var aft
  var raiser
  var lst = false

  if (my.game.chain) aqs.push(["_id", { $nin: my.game.chain }])
  raiser = DB.kkutu[my.rule.lang].find.apply(this, aqs).limit(bool ? 1 : 123)
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
