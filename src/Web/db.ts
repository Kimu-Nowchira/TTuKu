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
import { Pool, PoolClient } from "pg"
import { logger } from "../sub/jjlog"
import { Tail } from "../sub/lizard"
import { config } from "../config"
import { PgTable, RedisTable } from "../sub/collection"

const LANG = ["ko", "en"]

const FAKE_REDIS_FUNC = async () => {}

const FAKE_REDIS = {
  putGlobal: FAKE_REDIS_FUNC,
  getGlobal: FAKE_REDIS_FUNC,
  getPage: FAKE_REDIS_FUNC,
  getSurround: FAKE_REDIS_FUNC,
}

export let redis: typeof FAKE_REDIS | RedisTable

export const kkutu: Record<string, PgTable> = {}
export const kkutu_cw: Record<string, PgTable> = {}
export const kkutu_manner: Record<string, PgTable> = {}

export let kkutu_injeong: PgTable
export let kkutu_shop: PgTable
export let kkutu_shop_desc: PgTable
export let session: PgTable
export let users: PgTable
export let ip_block: PgTable

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

  const noRedis = await new Promise<boolean>((res) => {
    Redis.on("connect", () => res(false))

    Redis.on("error", (err: Error) => {
      logger.error("Error from Redis: " + err)
      logger.warn("Run with no-redis mode.")
      Redis.quit()
      res(true)
    })
  })

  const pgMain = await new Promise<PoolClient>((res, reject) =>
    Pg.connect((err, pgMain) => {
      if (err) reject(err)
      res(pgMain)
    })
  )

  redis = noRedis ? FAKE_REDIS : new RedisTable(Redis, "KKuTu_Score")

  for (const l of LANG) {
    kkutu[l] = new PgTable(pgMain, "kkutu_" + l)
    kkutu_cw[l] = new PgTable(pgMain, "kkutu_cw_" + l)
    kkutu_manner[l] = new PgTable(pgMain, "kkutu_manner_" + l)
  }

  kkutu_injeong = new PgTable(pgMain, "kkutu_injeong")
  kkutu_shop = new PgTable(pgMain, "kkutu_shop")
  kkutu_shop_desc = new PgTable(pgMain, "kkutu_shop_desc")

  session = new PgTable(pgMain, "session")
  users = new PgTable(pgMain, "users")
  ip_block = new PgTable(pgMain, "ip_block")

  if (exports.ready) exports.ready(Redis, Pg)
  else logger.warn("DB.onReady was not defined yet.")
}
