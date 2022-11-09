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

import cluster from "node:cluster"

const CPU = Number(process.argv[2])
if (isNaN(CPU)) throw new Error(`Invalid CPU Number ${CPU}`)

if (cluster.isPrimary) {
  for (let i = 0; i < CPU; i++) {
    cluster.fork({ SERVER_NO_FORK: true, WS_KEY: i + 1 })
  }

  cluster.on("exit", function (w) {
    console.log(`Worker ${w.process.pid} died`)
  })
} else {
  require("./main.js")
}
