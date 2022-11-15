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

// 많이 쓰인 단어 순위를 출력하는 스크립트

import { init as dbInit, kkutu } from "../sub/db"
import { IWord } from "../game/types"

const len = Number(process.argv[2] || 10)

const run = async () => {
  await dbInit()

  let rank = 0
  let pHit = 0

  kkutu["ko"]
    .find(["hit", { $gte: 1 }])
    .sort(["hit", -1])
    .limit(len)
    .on(($res: IWord[]) => {
      let c
      const res: string[] = []

      for (const i in $res) {
        const $o = $res[i]
        if (pHit === $o.hit) {
          c = rank
        } else {
          c = rank = Number(i) + 1
          pHit = $o.hit
        }
        res.push(c + "위. " + $o._id + " (" + $o.hit + ")")
      }
      console.log(res.join("\n"))
      process.exit()
    })
}

run().then()
