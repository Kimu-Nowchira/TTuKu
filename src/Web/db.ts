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
import * as checkPub from "../sub/checkpub"
import { Tail } from "../sub/lizard"

const LANG = ["ko", "en"]

const GLOBAL = require("../sub/global.json")
const Collection = require("../sub/collection")

const Pub = require("../sub/checkpub")

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

Pub.ready = () => {
  // const Redis = createClient({ socket: { host: "redis" } }) // 신형 레디스 기준
  const Redis = createClient({ host: "redis", port: 6379 }) // 구형 레디스 기준
  const Pg = new Pool({
    user: GLOBAL.PG_USER,
    password: GLOBAL.PG_PASSWORD,
    port: GLOBAL.PG_PORT,
    database: GLOBAL.PG_DATABASE,
    host: GLOBAL.PG_HOST,
  })

  Redis.on("connect", function () {
    connectPg()
  })

  Redis.on("error", function (err) {
    logger.error("Error from Redis: " + err)
    logger.warn("Run with no-redis mode.")
    Redis.quit()
    connectPg(true)
  })

  function connectPg(noRedis?: boolean) {
    Pg.connect(function (err, pgMain) {
      if (err) {
        logger.error(
          "Error when connect to PostgresSQL server: " + err.toString()
        )
        return
      }
      const redisAgent = noRedis ? null : new Collection.Agent("Redis", Redis)
      const mainAgent = new Collection.Agent("Postgres", pgMain)

      const DB = exports

      DB.kkutu = {}
      DB.kkutu_cw = {}
      DB.kkutu_manner = {}

      DB.redis = noRedis ? FAKE_REDIS : new redisAgent.Table("KKuTu_Score")
      for (const i in LANG) {
        DB.kkutu[LANG[i]] = new mainAgent.Table("kkutu_" + LANG[i])
        DB.kkutu_cw[LANG[i]] = new mainAgent.Table("kkutu_cw_" + LANG[i])
        DB.kkutu_manner[LANG[i]] = new mainAgent.Table(
          "kkutu_manner_" + LANG[i]
        )
      }
      DB.kkutu_injeong = new mainAgent.Table("kkutu_injeong")
      DB.kkutu_shop = new mainAgent.Table("kkutu_shop")
      DB.kkutu_shop_desc = new mainAgent.Table("kkutu_shop_desc")

      DB.session = new mainAgent.Table("session")
      DB.users = new mainAgent.Table("users")
      /* Enhanced User Block System [S] */
      DB.ip_block = new mainAgent.Table("ip_block")
      /* Enhanced User Block System [E] */

      if (exports.ready) exports.ready(Redis, Pg)
      else logger.warn("DB.onReady was not defined yet.")
    })
  }
}
