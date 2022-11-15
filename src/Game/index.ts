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

import cluster, { Worker as ClusterWorker } from "node:cluster"
import { logger } from "../sub/jjlog"
import { MAIN_PORTS } from "../const"
import { init as masterInit } from "./master"
import { init as slaveInit } from "./slave"
import * as os from "os"

// 첫 번째 인자: 이 프로세스가 담당하는 게임 서버의 ID ( 0: 감자, 1: 나래, 3: 다래 ...)
// ※ 기본값은 0 (감자 서버)
const serverId = process.argv[2] ? parseInt(process.argv[2]) : 0

// 두 번째 인자: 이 서버가 가질 워커의 수
// ※ 기본값은 CPU 코어 개수
let workerSize = process.argv[3] ? parseInt(process.argv[3]) : os.cpus().length

if (isNaN(serverId)) {
  if (process.argv[2] == "test") {
    global.test = true
    workerSize = 1
  } else {
    logger.error(`Invalid Server ID ${process.argv[2]}`)
    process.exit(1)
  }
}

if (isNaN(workerSize)) {
  logger.error(`Invalid CPU Number ${process.argv[3]}`)
  process.exit(1)
}

// 마스터 실행 메서드 ( 워커는 slaveInit()을 대신함 )
const run = async () => {
  logger.info(`Start Master Process (Server ID: ${serverId})`)

  const channels: Record<number, ClusterWorker> = {}
  let chan: number

  for (let i = 0; i < workerSize; i++) {
    chan = i + 1
    channels[chan] = cluster.fork({
      SERVER_NO_FORK: true,
      KKUTU_PORT: MAIN_PORTS[serverId] + 416 + i,
      CHANNEL: chan,
    })
  }
  logger.info(`Spawned ${workerSize} workers`)

  cluster.on("exit", (w) => {
    for (const i in channels) {
      if (channels[i] === w) {
        chan = Number(i)
        break
      }
    }

    logger.error(`Worker @${chan} ${w.process.pid} died`)
    channels[chan] = cluster.fork({
      SERVER_NO_FORK: true,
      KKUTU_PORT: MAIN_PORTS[serverId] + 416 + (chan - 1),
      CHANNEL: chan,
    })
  })

  process.env["KKUTU_PORT"] = MAIN_PORTS[serverId].toString()
  masterInit(serverId.toString(), channels).then()
}

if (cluster.isPrimary) run().then()
else slaveInit().then()
