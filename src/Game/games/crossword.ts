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

import { all, Tail } from "../../sub/lizard"
import { Game } from "./index"
import Client from "../classes/Client"

// const ROBOT_SEEK_DELAY = [5000, 3000, 1500, 700, 100]
// const ROBOT_CATCH_RATE = [0.05, 0.2, 0.4, 0.6, 0.99]
// const ROBOT_TYPE_COEF = [2000, 1200, 800, 300, 0]

export class Crossword extends Game {
  getTitle() {
    const R = new Tail()
    var means = []
    var mdb = []

    this.room.game.started = false
    DB.kkutu_cw[this.room.rule.lang].find().on(($box) => {
      var answers = {}
      var boards = []
      var maps = []
      var left = this.room.round
      var pick, pi, i, j
      var mParser = []

      while (left) {
        pick = $box[(pi = Math.floor(Math.random() * $box.length))]
        if (!pick) return
        $box.splice(pi, 1)
        if (maps.includes(pick.map)) continue
        means.push({})
        mdb.push({})
        maps.push(pick.map)
        boards.push(pick.data.split("|").map((item) => item.split(",")))
        left--
      }
      for (i in boards) {
        for (j in boards[i]) {
          pi = boards[i][j]
          mParser.push(getMeaning(i, pi))
          answers[`${i},${pi[0]},${pi[1]},${pi[2]}`] = pi.pop()
        }
      }
      this.room.game.numQ = mParser.length
      all(mParser).then(() => {
        this.room.game.prisoners = {}
        this.room.game.answers = answers
        this.room.game.boards = boards
        this.room.game.means = means
        this.room.game.mdb = mdb
        R.go("①②③④⑤⑥⑦⑧⑨⑩")
      })
    })
    const getMeaning = (round: string, bItem) => {
      var R = new Tail()
      var word = bItem[4]
      var x = Number(bItem[0]),
        y = Number(bItem[1])

      DB.kkutu[this.room.rule.lang].findOne(["_id", word]).on(($doc) => {
        if (!$doc) return R.go(null)
        var rk = `${x},${y}`
        var i, o

        means[round][`${rk},${bItem[2]}`] = o = {
          count: 0,
          x: x,
          y: y,
          dir: Number(bItem[2]),
          len: Number(bItem[3]),
          type: $doc.type,
          theme: $doc.theme,
          mean: $doc.mean.replace(
            new RegExp(
              word
                .split("")
                .map((w) => {
                  return w + "\\s?"
                })
                .join(""),
              "g"
            ),
            "★"
          ),
        }
        for (i = 0; i < o.len; i++) {
          rk = `${x},${y}`
          if (!mdb[round][rk]) mdb[round][rk] = []
          mdb[round][rk].push(o)
          if (o.dir) y++
          else x++
        }
        R.go(true)
      })
      return R
    }
    return R
  }

  async roundReady() {
    if (!this.room.game.started) {
      this.room.game.started = true
      this.room.game.roundTime = this.room.time * 1000
      this.room.byMaster(
        "roundReady",
        {
          seq: this.room.game.seq,
        },
        true
      )

      await new Promise((resolve) => setTimeout(resolve, 2400))
      this.room.turnStart()
    } else {
      this.room.roundEnd()
    }
  }

  async turnStart() {
    this.room.game.late = false
    this.room.game.roundAt = new Date().getTime()

    const turnEndAfterRoundTime = async () => {
      await new Promise(
        (resolve) =>
          (this.room.game.qTimer = setTimeout(
            resolve,
            this.room.game.roundTime
          ))
      )
      this.room.turnEnd()
    }

    turnEndAfterRoundTime().then()

    this.room.byMaster(
      "turnStart",
      {
        boards: this.room.game.boards,
        means: this.room.game.means,
      },
      true
    )
  }

  async turnEnd() {
    this.room.game.late = true
    this.room.byMaster("turnEnd", {})

    await new Promise(
      (resolve) => (this.room.game._rrt = setTimeout(resolve, 2500))
    )
    this.room.roundReady()
  }

  async submit(client: Client, text: string, data) {
    var obj, score, mbjs, mbj, jx, jy, v
    var play =
      (this.room.game.seq ? this.room.game.seq.includes(client.id) : false) ||
      client.robot
    var i, j, key

    if (!this.room.game.boards) return
    if (!this.room.game.answers) return
    if (!this.room.game.mdb) return
    if (data && play) {
      key = `${data[0]},${data[1]},${data[2]},${data[3]}`
      obj = this.room.game.answers[key]
      mbjs = this.room.game.mdb[data[0]]
      if (!mbjs) return
      if (obj && obj == text) {
        score = text.length * 10

        jx = Number(data[1])
        jy = Number(data[2])
        this.room.game.prisoners[key] = text
        this.room.game.answers[key] = false
        for (i = 0; i < obj.length; i++) {
          if ((mbj = mbjs[`${jx},${jy}`])) {
            for (j in mbj) {
              key = [data[0], mbj[j].x, mbj[j].y, mbj[j].dir]
              if (++mbj[j].count == mbj[j].len) {
                if ((v = this.room.game.answers[key.join(",")])) {
                  const submitAfterDelay = async () => {
                    await new Promise((resolve) => setTimeout(resolve, 1))
                    this.room.submit(client, v, key)
                  }

                  submitAfterDelay().then()
                }
              }
            }
          }
          if (data[3] == "1") jy++
          else jx++
        }
        client.game.score += score
        client.publish("turnEnd", {
          target: client.id,
          pos: data,
          value: text,
          score: score,
        })
        client.invokeWordPiece(text, 1.2)
        if (--this.room.game.numQ < 1) {
          clearTimeout(this.room.game.qTimer)
          this.room.turnEnd()
        }
      } else client.send("turnHint", { value: text })
    } else {
      client.chat(text)
    }
  }

  getScore(text, delay) {
    var rank = this.room.game.hum - this.room.game.primary + 3
    var tr = 1 - delay / this.room.game.roundTime
    var score = rank * rank * 3 * (0.5 + 0.5 * tr)

    return Math.round(score * this.room.game.themeBonus)
  }

  turnHint() {
    this.room.byMaster(
      "turnHint",
      {
        hint: this.room.game.hint[this.room.game.meaned++],
      },
      true
    )
  }
}
