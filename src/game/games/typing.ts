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

import { PROVERBS } from "./typingConst"
import { Tail } from "../../sub/lizard"
import { Game } from "./index"
import { kkutu } from "../../Web/db"
import { IWord } from "../types"

const LIST_LENGTH = 200
const DOUBLE_VOWELS = [9, 10, 11, 14, 15, 16, 19]
const DOUBLE_TAILS = [3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 18]

export class Typing extends Game {
  async getTitle() {
    const pick = (list: string[]) => {
      const data = []

      for (let i = 0; i < this.room.round; i++) {
        const arr = []
        for (let j = 0; j < LIST_LENGTH; j++) {
          arr.push(list[Math.floor(Math.random() * list.length)])
        }
        data.push(arr)
      }
      this.room.game.lists = data
    }

    if (this.room.opts.proverb) pick(PROVERBS[this.room.rule.lang])
    else {
      const $res = (await kkutu[this.room.rule.lang]
        .find(["_id", /^.{2,5}$/], ["hit", { $gte: 1 }])
        .limit(416)
        .onAsync()) as IWord[]

      pick($res.map((item) => item._id))
    }

    traverse.call(this, (o) => {
      o.game.spl = 0
    })

    return "①②③④⑤⑥⑦⑧⑨⑩"
  }

  async roundReady() {
    const scores: Record<string, number> = {}

    if (!this.room.game.lists) return

    this.room.game.round++
    this.room.game.roundTime = this.room.time * 1000
    if (this.room.game.round <= this.room.round) {
      this.room.game.clist = this.room.game.lists.shift()
      this.room.byMaster(
        "roundReady",
        {
          round: this.room.game.round,
          list: this.room.game.clist,
        },
        true
      )
      await new Promise((res) => setTimeout(res, 2400))
      this.room.turnStart()
    } else {
      traverse.call(this, (o) => {
        scores[o.id] = Math.round(o.game.spl / this.room.round)
      })
      this.room.roundEnd({ scores: scores })
    }
  }

  async turnStart() {
    this.room.game.late = false
    traverse.call(this, (o) => {
      o.game.miss = 0
      o.game.index = 0
      o.game.semi = 0
    })

    this.room.byMaster(
      "turnStart",
      { roundTime: this.room.game.roundTime },
      true
    )

    await new Promise(
      (res) =>
        (this.room.game.qTimer = setTimeout(res, this.room.game.roundTime))
    )
    this.turnEnd().then()
  }

  async turnEnd() {
    var spl = {}
    var sv

    this.room.game.late = true
    traverse.call(this, (o) => {
      sv = ((o.game.semi + o.game.index - o.game.miss) / this.room.time) * 60
      spl[o.id] = Math.round(sv)
      o.game.spl += sv
    })
    this.room.byMaster("turnEnd", {
      ok: false,
      speed: spl,
    })

    await new Promise(
      (res) =>
        (this.room.game._rrt = setTimeout(res, this.room.round ? 3000 : 10000))
    )
    this.roundReady().then()
  }

  async submit(client, text) {
    if (!client.game) return

    if (this.room.game.clist[client.game.index] == text) {
      const score = this.getScore(text)

      client.game.semi += score
      client.game.score += score
      client.publish(
        "turnEnd",
        {
          target: client.id,
          ok: true,
          value: text,
          score: score,
        },
        true
      )
      client.invokeWordPiece(text, 0.5)
    } else {
      client.game.miss++
      client.send("turnEnd", { error: true })
    }
    if (!this.room.game.clist[++client.game.index]) client.game.index = 0
  }

  getScore(text) {
    var i,
      len = text.length
    var r = 0,
      s,
      t

    switch (this.room.rule.lang) {
      case "ko":
        for (i = 0; i < len; i++) {
          s = text.charCodeAt(i)
          if (s < 44032) {
            r++
          } else {
            t = (s - 44032) % 28
            r += t ? 3 : 2
            if (
              DOUBLE_VOWELS.includes(
                Math.floor(((text.charCodeAt(i) - 44032) % 588) / 28)
              )
            )
              r++
            if (DOUBLE_TAILS.includes(t)) r++
          }
        }
        return r
      case "en":
        return len
      default:
        return r
    }
  }
}

function traverse(func) {
  const my = this as Typing

  for (const i in my.room.game.seq) {
    const o = this.DIC[my.room.game.seq[i]]
    if (!o) continue
    if (!o.game) continue
    func(o)
  }
}
