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

import { createClient } from "redis"
import { Pool } from "pg"
import { logger } from "../sub/jjlog"
import { Tail } from "../sub/lizard"
import { config } from "../config"
import { Agent, RedisTable } from "../sub/collection"

const LANG = ["ko", "en"]

const FAKE_REDIS_FUNC = () => {
  const R = new Tail()

  R.go({})
  return R
}

const FAKE_REDIS = {
  putGlobal: FAKE_REDIS_FUNC,
  getGlobal: FAKE_REDIS_FUNC,
  getPage: FAKE_REDIS_FUNC,
  getSurround: FAKE_REDIS_FUNC,
}

export const init = async () => {
  // const Redis = createClient({ socket: { host: "redis" } }) // 신형 레디스 기준
  const Redis = createClient({ host: "redis", port: 6379 }) // 구형 레디스 기준
  const Pg = new Pool({
    user: config.PG_USER,
    password: config.PG_PASSWORD,
    port: config.PG_PORT,
    database: config.PG_DATABASE,
    host: config.PG_HOST,
  })

  Redis.on("connect", () => connectPg())

  Redis.on("error", (err: Error) => {
    logger.error("Error from Redis: " + err)
    logger.warn("Run with no-redis mode.")
    Redis.quit()
    connectPg(true)
  })

  function connectPg(noRedis?: boolean) {
    Pg.connect(function (err, pgMain) {
      if (err)
        return logger.error(
          "Error when connect to PostgresSQL server: " + err.toString()
        )

      const mainAgent = new Agent("Postgres", pgMain)

      exports.kkutu = {}
      exports.kkutu_cw = {}
      exports.kkutu_manner = {}

      exports.redis = noRedis
        ? FAKE_REDIS
        : new RedisTable(Redis, "KKuTu_Score")

      for (const i in LANG) {
        exports.kkutu[LANG[i]] = new mainAgent.Table("kkutu_" + LANG[i])
        exports.kkutu_cw[LANG[i]] = new mainAgent.Table("kkutu_cw_" + LANG[i])
        exports.kkutu_manner[LANG[i]] = new mainAgent.Table(
          "kkutu_manner_" + LANG[i]
        )
      }

      exports.kkutu_injeong = new mainAgent.Table("kkutu_injeong")
      exports.kkutu_shop = new mainAgent.Table("kkutu_shop")
      exports.kkutu_shop_desc = new mainAgent.Table("kkutu_shop_desc")

      exports.session = new mainAgent.Table("session")
      exports.users = new mainAgent.Table("users")
      exports.ip_block = new mainAgent.Table("ip_block")

      if (exports.ready) exports.ready(Redis, Pg)
      else logger.warn("DB.onReady was not defined yet.")
    })
  }
}
