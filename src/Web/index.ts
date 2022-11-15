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
import { logger } from "../sub/jjlog"
import { run as runMain } from "./main"

// 첫 번째 인자: 워커 개수 (기본값은 1)
const CPU = Number(process.argv[2]) || 1
if (isNaN(CPU)) throw new Error(`Invalid CPU Number ${CPU}`)

const run = async () => {
  for (let i = 0; i < CPU; i++) {
    cluster.fork({ SERVER_NO_FORK: true, WS_KEY: i + 1 })
  }

  cluster.on("exit", (w) => {
    logger.warn(`Worker ${w.process.pid} died`)
  })
}

if (cluster.isPrimary) run().then()
else runMain().then()
