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

import Room from "../classes/Room"
import { Tail } from "../../sub/lizard"
import { Game } from "./index"
import { INIT_SOUNDS, KOR_GROUP } from "../../const"
import { kkutu } from "../../Web/db"

const ROBOT_CATCH_RATE = [0.1, 0.3, 0.5, 0.7, 0.99]
const ROBOT_TYPE_COEF = [2000, 1200, 800, 300, 0]

export class Jaqwi extends Game {
  getTitle() {
    var R = new Tail()

    this.room.game.done = []
    setTimeout(() => {
      R.go("①②③④⑤⑥⑦⑧⑨⑩")
    }, 500)
    return R
  }

  async roundReady() {
    var ijl = this.room.opts.injpick.length

    clearTimeout(this.room.game.qTimer)
    clearTimeout(this.room.game.hintTimer)
    clearTimeout(this.room.game.hintTimer2)
    this.room.game.themeBonus = 0.3 * Math.log(0.6 * ijl + 1)
    this.room.game.winner = []
    this.room.game.giveup = []
    this.room.game.round++
    this.room.game.roundTime = this.room.time * 1000
    if (this.room.game.round <= this.room.round) {
      this.room.game.theme =
        this.room.opts.injpick[Math.floor(Math.random() * ijl)]
      getAnswer.call(this.room, this.room.game.theme).then(($ans) => {
        if (!this.room.game.done) return

        // $ans가 null이면 골치아프다...
        this.room.game.late = false
        this.room.game.answer = $ans || {}
        this.room.game.done.push($ans._id)
        $ans.mean =
          $ans.mean.length > 20
            ? $ans.mean
            : getConsonants($ans._id, Math.round($ans._id.length / 2))
        this.room.game.hint = getHint($ans)
        this.room.byMaster(
          "roundReady",
          {
            round: this.room.game.round,
            theme: this.room.game.theme,
          },
          true
        )
        setTimeout(this.room.turnStart, 2400)
      })
    } else {
      this.room.roundEnd()
    }
  }

  async turnStart() {
    var i

    if (!this.room.game.answer) return

    this.room.game.conso = getConsonants(this.room.game.answer._id, 1)
    this.room.game.roundAt = new Date().getTime()
    this.room.game.meaned = 0
    this.room.game.primary = 0
    this.room.game.qTimer = setTimeout(
      this.room.turnEnd,
      this.room.game.roundTime
    )
    this.room.game.hintTimer = setTimeout(() => {
      turnHint.call(this.room)
    }, this.room.game.roundTime * 0.333)
    this.room.game.hintTimer2 = setTimeout(() => {
      turnHint.call(this.room)
    }, this.room.game.roundTime * 0.667)
    this.room.byMaster(
      "turnStart",
      {
        char: this.room.game.conso,
        roundTime: this.room.game.roundTime,
      },
      true
    )

    for (i in this.room.game.robots) {
      this.room.readyRobot(this.room.game.robots[i])
    }
  }

  async turnEnd() {
    if (this.room.game.answer) {
      this.room.game.late = true
      this.room.byMaster("turnEnd", {
        answer: this.room.game.answer ? this.room.game.answer._id : "",
      })
    }
    this.room.game._rrt = setTimeout(this.room.roundReady, 2500)
  }

  async submit(client, text) {
    var score, t, i
    var $ans = this.room.game.answer
    var now = new Date().getTime()
    var play =
      (this.room.game.seq ? this.room.game.seq.includes(client.id) : false) ||
      client.robot
    var gu = this.room.game.giveup
      ? this.room.game.giveup.includes(client.id)
      : true

    if (!this.room.game.winner) return
    if (
      this.room.game.winner.indexOf(client.id) == -1 &&
      text == $ans._id &&
      play &&
      !gu
    ) {
      t = now - this.room.game.roundAt
      if (this.room.game.primary == 0)
        if (this.room.game.roundTime - t > 10000) {
          // 가장 먼저 맞힌 시점에서 10초 이내에 맞히면 점수 약간 획득
          clearTimeout(this.room.game.qTimer)
          this.room.game.qTimer = setTimeout(this.room.turnEnd, 10000)
          for (i in this.room.game.robots) {
            if (this.room.game.roundTime > this.room.game.robots[i]._delay) {
              clearTimeout(this.room.game.robots[i]._timer)
              if (client != this.room.game.robots[i])
                if (
                  Math.random() <
                  ROBOT_CATCH_RATE[this.room.game.robots[i].level]
                )
                  this.room.game.robots[i]._timer = setTimeout(
                    this.room.turnRobot,
                    ROBOT_TYPE_COEF[this.room.game.robots[i].level],
                    this.room.game.robots[i],
                    text
                  )
            }
          }
        }
      clearTimeout(this.room.game.hintTimer)
      score = this.room.getScore(text, t)
      this.room.game.primary++
      this.room.game.winner.push(client.id)
      client.game.score += score
      client.publish(
        "turnEnd",
        {
          target: client.id,
          ok: true,
          value: text,
          score: score,
          bonus: 0,
        },
        true
      )
      client.invokeWordPiece(text, 0.9)
      while (this.room.game.meaned < this.room.game.hint.length) {
        turnHint.call(this.room)
      }
    } else if (play && !gu && (text == "gg" || text == "ㅈㅈ")) {
      this.room.game.giveup.push(client.id)
      client.publish(
        "turnEnd",
        {
          target: client.id,
          giveup: true,
        },
        true
      )
    } else {
      client.chat(text)
    }
    if (play)
      if (
        this.room.game.primary + this.room.game.giveup.length >=
        this.room.game.seq.length
      ) {
        clearTimeout(this.room.game.hintTimer)
        clearTimeout(this.room.game.hintTimer2)
        clearTimeout(this.room.game.qTimer)
        this.room.turnEnd()
      }
  }

  getScore(text, delay) {
    const rank = this.room.game.hum - this.room.game.primary + 3
    const tr = 1 - delay / this.room.game.roundTime
    const score = 6 * Math.pow(rank, 1.4) * (0.5 + 0.5 * tr)

    return Math.round(score * this.room.game.themeBonus)
  }

  async readyRobot(robot) {
    var level = robot.level
    var delay, text

    if (!this.room.game.answer) return
    clearTimeout(robot._timer)
    robot._delay = 99999999
    for (let i = 0; i < 2; i++) {
      if (Math.random() < ROBOT_CATCH_RATE[level]) {
        text = this.room.game.answer._id
        delay =
          (this.room.game.roundTime / 3) * i +
          text.length * ROBOT_TYPE_COEF[level]
        robot._timer = setTimeout(this.room.turnRobot, delay, robot, text)
        robot._delay = delay
        break
      }
    }
  }
}

function turnHint() {
  const my = this as Room

  my.byMaster(
    "turnHint",
    {
      hint: my.game.hint[my.game.meaned++],
    },
    true
  )
}

const getConsonants = (word, lucky) => {
  var R = ""
  const len = word.length
  var c
  var rv = []

  lucky = lucky || 0
  while (lucky > 0) {
    c = Math.floor(Math.random() * len)
    if (rv.includes(c)) continue
    rv.push(c)
    lucky--
  }
  for (let i = 0; i < len; i++) {
    c = word.charCodeAt(i) - 44032

    if (c < 0 || rv.includes(i)) {
      R += word.charAt(i)
      continue
    } else c = Math.floor(c / 588)
    R += INIT_SOUNDS[c]
  }
  return R
}

const getHint = ($ans) => {
  var R = []
  var h1 = $ans.mean.replace(new RegExp($ans._id, "g"), "★")
  var h2

  R.push(h1)
  do {
    h2 = getConsonants($ans._id, Math.ceil($ans._id.length / 2))
  } while (h1 == h2)
  R.push(h2)

  return R
}

function getAnswer(theme) {
  const my = this as Room
  var R = new Tail()
  const args: [string, any][] = [["_id", { $nin: my.game.done }]]

  args.push(["theme", new RegExp("(,|^)(" + theme + ")(,|$)")])
  args.push(["type", KOR_GROUP])
  args.push(["flag", { $lte: 7 }])
  kkutu["ko"].find.apply(my, args).on(($res) => {
    if (!$res) return R.go(null)
    var pick
    var len = $res.length

    if (!len) return R.go(null)
    do {
      pick = Math.floor(Math.random() * len)
      if ($res[pick]._id.length >= 2)
        if ($res[pick].type == "INJEONG" || $res[pick].mean.length >= 0) {
          return R.go($res[pick])
        }
      $res.splice(pick, 1)
      len--
    } while (len > 0)
    R.go(null)
  })
  return R
}
