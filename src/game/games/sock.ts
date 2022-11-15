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
import { Tail } from "../../sub/lizard"
import { Game } from "./index"
import { KOR_GROUP } from "../../const"
import { kkutu } from "../../Web/db"

const LANG_STATS = {
  ko: {
    reg: /^[가-힣]{2,5}$/,
    add: ["type", KOR_GROUP],
    len: 64,
    min: 5,
  },
  en: {
    reg: /^[a-z]{4,10}$/,
    add: undefined,
    len: 100,
    min: 10,
  },
}

export class Sock extends Game {
  async roundReady() {
    var words = []
    var conf = LANG_STATS[this.room.rule.lang]
    var len = conf.len
    var i, w

    clearTimeout(this.room.game.turnTimer)
    this.room.game.round++
    this.room.game.roundTime = this.room.time * 1000
    if (this.room.game.round <= this.room.round) {
      kkutu[this.room.rule.lang]
        .find(["_id", conf.reg], ["hit", { $gte: 1 }], conf.add)
        .limit(1234)
        .on(($docs) => {
          $docs.sort(() => Math.random() < 0.5)
          while ((w = $docs.shift())) {
            words.push(w._id)
            i = w._id.length
            if ((len -= i) <= conf.min) break
          }
          words.sort((a, b) => b.length - a.length)
          this.room.game.words = []
          this.room.game.board = this.getBoard(words, conf.len)
          this.room.byMaster(
            "roundReady",
            {
              round: this.room.game.round,
              board: this.room.game.board,
            },
            true
          )

          const turnStartAfterDelay = async () => {
            await new Promise(
              (resolve) =>
                (this.room.game.turnTimer = setTimeout(resolve, 2400))
            )
            this.room.turnStart()
          }

          turnStartAfterDelay().then()
        })
    } else {
      this.room.roundEnd()
    }
  }

  async turnStart() {
    this.room.game.late = false
    this.room.game.roundAt = new Date().getTime()
    this.room.byMaster(
      "turnStart",
      {
        roundTime: this.room.game.roundTime,
      },
      true
    )

    // sleep
    await new Promise(
      (resolve) =>
        (this.room.game.qTimer = setTimeout(resolve, this.room.game.roundTime))
    )
    this.room.turnEnd()
  }

  async turnEnd() {
    this.room.game.late = true

    this.room.byMaster("turnEnd", {})

    await new Promise(
      (resolve) => (this.room.game._rrt = setTimeout(resolve, 3000))
    )
    this.room.roundReady()
  }

  async submit(client, text, data) {
    var play =
      (this.room.game.seq ? this.room.game.seq.includes(client.id) : false) ||
      client.robot
    var score, i

    if (!this.room.game.words) return
    if (!text) return

    if (!play) return client.chat(text)
    if (text.length < (this.room.opts.no2 ? 3 : 2)) {
      return client.chat(text)
    }
    if (this.room.game.words.indexOf(text) != -1) {
      return client.chat(text)
    }

    kkutu[this.room.rule.lang]
      .findOne(["_id", text])
      .limit(["_id", true])
      .on(($doc) => {
        if (!this.room.game.board) return

        var newBoard = this.room.game.board
        var _newBoard = newBoard
        var wl

        if ($doc) {
          wl = $doc._id.split("")
          for (i in wl) {
            newBoard = newBoard.replace(wl[i], "")
            if (newBoard == _newBoard) {
              // 그런 글자가 없다.
              client.chat(text)
              return
            }
            _newBoard = newBoard
          }
          // 성공
          score = this.getScore(text)
          this.room.game.words.push(text)
          this.room.game.board = newBoard
          client.game.score += score
          client.publish(
            "turnEnd",
            {
              target: client.id,
              value: text,
              score: score,
            },
            true
          )
          client.invokeWordPiece(text, 1.1)
        } else {
          client.chat(text)
        }
      })
  }

  getScore(text) {
    return Math.round(Math.pow(text.length - 1, 1.6) * 8)
  }

  getBoard(words, len) {
    const str = words.join("").split("")
    let sl = str.length

    while (sl++ < len) str.push("　")
    return str.sort(() => Math.random() < 0.5).join("")
  }
}
