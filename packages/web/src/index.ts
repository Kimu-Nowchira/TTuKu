import cluster from "node:cluster"
import { logger } from "../../game/src/utils/jjlog"
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
