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

import escape from "pg-escape"
import { logger } from "./jjlog"
import { Tail } from "./lizard"
import { PoolClient } from "pg"

const DEBUG = true

// KEY
const asKey = (val: string) => {
  if (val.indexOf(".") == -1) {
    const v = escape.ident(val)

    if (v.charAt(0) == '"') return v
    else return '"' + v + '"'
  }
  const ar = val.split("."),
    aEnd = ar.pop()

  return (
    ar
      .map((item, x) => (x ? `'${escape.literal(item)}'` : escape.ident(item)))
      .join("->") + `->>'${aEnd}'`
  )
}

// (JSON ENDPOINT) KEY
const asSKey = (val: string) => {
  if (val.indexOf(".") == -1) return asKey(val)

  const c = val
    .split(".")
    .map((item, x) => (x ? escape.literal(item) : escape.ident(item)))

  return c.slice(0, c.length - 1).join("->") + "->>" + c[c.length - 1]
}

const asValue = (val: string[] | number | string): string => {
  if (val instanceof Array) return escape.literal("{" + val.join(",") + "}")
  if (typeof val === "number") return val.toString()
  if (typeof val === "string") return escape.literal(val)
  return escape.literal(JSON.stringify(val))
}

const Escape = (str: string, ...a: string[]) => {
  let i = 1
  const args = [str, ...a]

  return str.replace(/%([%sILQkKV])/g, (_, type) => {
    if ("%" == type) return "%"

    const arg = args[i++] || ""
    switch (type) {
      case "s":
        return escape.string(arg)
      case "I":
        return escape.ident(arg)
      case "L":
        return escape.literal(arg)
      case "Q":
        return escape.dollarQuotedString(arg)
      case "k":
        return asSKey(arg)
      case "K":
        return asKey(arg)
      case "V":
        return asValue(arg)
      default:
        logger.warn("Unknown escape type: " + type)
        return ""
    }
  })
}

global.getType = (obj: any): string => {
  if (obj === undefined) return ""

  const s = obj.constructor.toString()
  return s.slice(9, s.indexOf("("))
}

const isObjectQuery = (
  q: ObjectQuery | Query | QueryElement
): q is ObjectQuery => {
  return typeof q === "object" && !Array.isArray(q)
}

const query = (_q: Query): Query => {
  const res: Query = []
  for (const i of _q) if (i) res.push(i)
  return res
}

// Object Query의 준말로, {"_id": -1}을 ["_id", -1]과 같은 형태로 변환한다.
const oQuery = (_q: ObjectQuery) => {
  const res: Query = []
  for (const i in _q) if (_q[i]) res.push([i, _q[i]])
  return res
}

const uQuery = (q: Query, id: QueryValue) => {
  const res: Query = []
  let noId = true

  for (const i in q) {
    let c = q[i][0]

    if (q[i][0] == "_id") {
      noId = false
    } else if (typeof c === "string") {
      const _c = c.split(".")
      if (_c.length > 1) {
        const jo = {}
        let j = jo

        q[i][0] = _c.shift()
        while (_c.length > 1) {
          j = j[_c.shift()] = {}
        }
        j[_c.shift()] = q[i][1]
        q[i][1] = JSON.stringify(jo)
      }
    }
    res.push([q[i][0], q[i][1]])
  }
  if (noId) res.push(["_id", id])
  return res
}

const sqlSelect = (q: Query) => {
  if (!Object.keys(q).length) return "*"

  return q
    .map((item) => {
      if (!item[1]) throw new Error(item[0])
      return Escape("%K", item[0])
    })
    .join(", ")
}

const sqlWhere = (q: Query) => {
  if (!Object.keys(q).length) return "TRUE"

  const wSearch = (item: QueryElement): string => {
    const value = item[1]
    let c

    if (value instanceof RegExp) {
      return Escape("%K ~ %L", item[0], value.source)
    } else if (typeof value === "object") {
      if ((c = value["$not"]) !== undefined)
        return Escape("NOT (%s)", wSearch([item[0], c]))
      if ((c = value["$nand"]) !== undefined)
        return Escape("%K & %V = 0", item[0], c)
      if ((c = value["$lte"]) !== undefined) return Escape("%K<=%V", item[0], c)
      if ((c = value["$gte"]) !== undefined) return Escape("%K>=%V", item[0], c)
      if ((c = value["$in"]) !== undefined) {
        if (!c.length) return "FALSE"
        return Escape(
          "%I IN (%s)",
          item[0],
          c.map((i) => Escape("%V", i)).join(",")
        )
      }
      if ((c = item[1]["$nin"]) !== undefined) {
        if (!c.length) return "TRUE"
        return Escape(
          "%I NOT IN (%s)",
          item[0],
          c.map((i) => Escape("%V", i)).join(",")
        )
      }
    } else {
      return Escape("%K=%V", item[0], String(value))
    }

    throw new Error("Unknown query: " + JSON.stringify(item))
  }

  return q.map(wSearch).join(" AND ")
}

const sqlSet = (q: Query, inc?: boolean) => {
  if (!q) {
    // warn -> error로 상향
    throw new Error("[sqlSet] Invalid query.")
    // return null
  }
  const doN = inc
      ? (k, v) => Escape("%K=%K+%V", k, k, v)
      : (k, v) => Escape("%K=%V", k, v),
    doJ = inc
      ? () => {
          logger.warn("[sqlSet] Cannot increase a value in JSON object.")
          return null //Escape("%K=jsonb_set(%K,%V,CAST(CAST(%k AS bigint)+%V AS text),true)", k, k, p, ok, Number(v));
        }
      : (k, p, ok, v) => Escape("%K=jsonb_set(%K,%V,%V,true)", k, k, p, v)

  return q
    .map((item) => {
      const c = item[0].split(".")

      if (c.length === 1) return doN(item[0], item[1])

      /* JSON 값 내부를 수정하기
      1. UPSERT 할 수 없다.
      2. 한 쿼리에 여러 값을 수정할 수 없다.
    */

      if (typeof item[1] === "number") item[1] = item[1].toString()
      return doJ(c[0], c.slice(1), item[0], item[1])
    })
    .join(", ")
}

const sqlIK = (q) => q.map((item) => Escape("%K", item[0])).join(", ")
const sqlIV = (q) => q.map((item) => Escape("%V", item[1])).join(", ")

const isDataAvailable = (data, chk) => {
  let path
  let cursor

  if (data == null) return false

  for (const i in chk) {
    cursor = data
    path = i.split(".")
    for (const j in path) {
      if (cursor[path[j]] === null) return false
      if (cursor.hasOwnProperty(path[j]) == chk[i]) cursor = data[path[j]]
      else return false
    }
  }

  return true
}

export class RedisTable {
  constructor(public redis: any, public key: string) {}

  putGlobal = (id: string, score: number) => {
    const R = new Tail()

    this.redis.zadd([this.key, score, id], () => {
      R.go(id)
    })
    return R
  }

  getGlobal = (id: string) => {
    const R = new Tail()

    this.redis.zrevrank([this.key, id], (err, res) => {
      R.go(res)
    })
    return R
  }

  getPage = (pg: number, lpp: number) => {
    const R = new Tail()

    this.redis.zrevrange(
      [this.key, pg * lpp, (pg + 1) * lpp - 1, "WITHSCORES"],
      (err, res) => {
        const A = []
        const len = res.length
        let rank = pg * lpp

        for (let i = 0; i < len; i += 2) {
          A.push({ id: res[i], rank: rank++, score: res[i + 1] })
        }
        R.go({ page: pg, data: A })
      }
    )
    return R
  }

  getSurround = (id: string, rv: number) => {
    const R = new Tail()

    rv = rv || 8
    this.redis.zrevrank([this.key, id], (err, res) => {
      const range = [Math.max(0, res - Math.round(rv / 2 + 1)), 0]

      range[1] = range[0] + rv - 1
      this.redis.zrevrange(
        [this.key, range[0], range[1], "WITHSCORES"],
        (err, res) => {
          if (!res) return R.go({ target: id, data: [] })

          const A = []
          const len = res.length

          for (let i = 0; i < len; i += 2) {
            A.push({ id: res[i], rank: range[0]++, score: res[i + 1] })
          }
          R.go({ target: id, data: A })
        }
      )
    })
    return R
  }
}

class Pointer {
  second: Record<string, Query> = {} // "$set" | "$setOrInsert" | "$inc"
  third: Query = []
  sorts = null as any

  // Limit 값으로 0일 때는 Limit 옵션이 없는 것으로 취급한다.
  findLimit: number = 0

  constructor(
    public mode:
      | "findOne"
      | "find"
      | "insert"
      | "update"
      | "upsert"
      | "remove"
      | "createColumn",
    public q: Query | CreateColumnQuery,
    public col: string,
    public origin: PoolClient
  ) {}
  /* on: 입력받은 쿼리를 실행시킨다.
    @f		콜백 함수
    @chk	정보가 유효할 조건
    @onFail	유효하지 않은 정보일 경우에 대한 콜백 함수
  */

  on(f?: Function, chk: boolean = false, onFail?: (doc: any) => void) {
    let sql = ""
    const sq = this.second["$set"]

    const callback = (err: Error, doc) => {
      if (f) {
        if (chk) {
          if (isDataAvailable(doc, chk)) f(doc)
          else {
            // isDataAvailable 하지 않은 경우
            if (onFail) onFail(doc)
            else if (DEBUG)
              throw new Error(
                "The data from " +
                  this.mode +
                  "[" +
                  JSON.stringify(this.q) +
                  "] was not available."
              )
            else
              logger.warn(
                "The data from [" +
                  JSON.stringify(this.q) +
                  "] was not available. Callback has been canceled."
              )
          }
        } else f(doc)
      }
    }

    const preCB = (err, res) => {
      if (err) {
        logger.error("Error when querying: " + sql)
        logger.error("Context: " + err.toString())
        if (onFail) {
          logger.info("onFail calling...")
          onFail(err)
        }
        return
      }
      if (res) {
        if (this.mode == "findOne") {
          if (res.rows) res = res.rows[0]
        } else if (res.rows) res = res.rows
      }
      callback(err, res)
      /*
      if(mode == "find"){
        if(_my.sorts){
          doc = doc.sort(_my.sorts);
        }
        doc.toArray(callback);
      }else callback(err, doc);*/
    }

    switch (this.mode) {
      case "findOne":
        this.findLimit = 1
      // fall-through
      case "find":
        sql = Escape("SELECT %s FROM %I", sqlSelect(this.third), this.col)
        if (this.q) sql += Escape(" WHERE %s", sqlWhere(this.q as Query))
        if (this.sorts)
          sql += Escape(
            " ORDER BY %s",
            this.sorts
              .map((item) => item[0] + (item[1] == 1 ? " ASC" : " DESC"))
              .join(",")
          )
        if (this.findLimit) sql += Escape(" LIMIT %V", String(this.findLimit))
        break
      case "insert":
        sql = Escape(
          "INSERT INTO %I (%s) VALUES (%s)",
          this.col,
          sqlIK(this.q as Query),
          sqlIV(this.q as Query)
        )
        break
      case "update":
        const sqs = this.second["$inc"]
          ? sqlSet(this.second["$inc"], true)
          : sqlSet(sq)
        sql = Escape("UPDATE %I SET %s", this.col, sqs)
        if (this.q) sql += Escape(" WHERE %s", sqlWhere(this.q as Query))
        break
      case "upsert":
        // 업데이트 대상을 항상 _id(q의 가장 앞 값)로 가리키는 것으로 가정한다.
        const uq = uQuery(sq, (this.q as Query)[0][1])
        sql = Escape(
          "INSERT INTO %I (%s) VALUES (%s)",
          this.col,
          sqlIK(uq),
          sqlIV(uq)
        )
        sql += Escape(" ON CONFLICT (_id) DO UPDATE SET %s", sqlSet(sq))
        break
      case "remove":
        sql = Escape("DELETE FROM %I", this.col)
        if (this.q) sql += Escape(" WHERE %s", sqlWhere(this.q as Query))
        break
      case "createColumn":
        sql = Escape(
          "ALTER TABLE %I ADD COLUMN %K %I",
          this.col,
          (this.q as CreateColumnQuery)[0],
          (this.q as CreateColumnQuery)[1]
        )
        break
      default:
        logger.warn("Unhandled mode: " + this.mode)
    }

    if (!sql) return logger.warn("SQL is undefined. This call will be ignored.")
    if (!this.origin) throw new Error("The origin of the query is not defined.")

    logger.debug("Query: " + sql.slice(0, 100))
    this.origin.query(sql, preCB)
    /*if(_my.findLimit){

      c = my.source[mode](q, flag, { limit: _my.findLimit }, preCB);
    }else{
      c = my.source[mode](q, _my.second, flag, preCB);
    }*/
    return sql
  }

  // on을 Promise로 처리합니다.
  async onAsync(check: boolean = false) {
    return new Promise((resolve, reject) => {
      this.on(resolve, check, reject)
    })
  }

  // limit: find 쿼리에 걸린 문서를 필터링하는 지침을 정의한다.
  limit(_data: number | QueryElement, ...args: Query) {
    if (typeof _data === "number") {
      this.findLimit = _data
    } else {
      // second => third
      this.third = query([_data, ...args])
      this.third.push(["_id", true])
    }
    return this
  }
  sort(_data: QueryElement | ObjectQuery, ...args: Query) {
    this.sorts = isObjectQuery(_data) ? oQuery(_data) : query([_data, ...args])
    return this
  }
  // set: update 쿼리에 걸린 문서를 수정하는 지침을 정의한다.
  set(_data: QueryElement | ObjectQuery, ...args: Query) {
    this.second["$set"] = isObjectQuery(_data)
      ? oQuery(_data)
      : query([_data, ...args])
    return this
  }
  // soi: upsert 쿼리에 걸린 문서에서, insert될 경우의 값을 정한다. (setOnInsert)
  soi(_data: QueryElement | ObjectQuery, ...args: Query) {
    this.second["$setOnInsert"] = isObjectQuery(_data)
      ? oQuery(_data)
      : query([_data, ...args])
    return this
  }
  // inc: update 쿼리에 걸린 문서의 특정 값을 늘인다.
  inc(_data: QueryElement | ObjectQuery, ...args: Query) {
    this.second["$inc"] = isObjectQuery(_data)
      ? oQuery(_data)
      : query([_data, ...args])
    return this
  }
}

type QueryValue =
  | string
  | number
  | boolean
  | RegExp
  | Record<string, string | number | RegExp>

type ObjectQuery = Record<string, QueryValue>

type QueryElement = [string, QueryValue]

type Query = QueryElement[]

type CreateColumnQuery = [string, string]

export class PgTable {
  // TODO 중복 변수 제거
  source: string

  constructor(public origin: PoolClient, public col: string) {
    this.source = col
  }

  findOne(...args: Query) {
    return new Pointer("findOne", query(args), this.col, this.origin)
  }

  find(...args: Query) {
    return new Pointer("find", query(args), this.col, this.origin)
  }

  insert(...args: [string, string][]) {
    return new Pointer("insert", query(args), this.col, this.origin)
  }

  update(...args: Query) {
    return new Pointer("update", query(args), this.col, this.origin)
  }

  upsert(...args: Query) {
    return new Pointer("upsert", query(args), this.col, this.origin)
  }

  remove(...args: Query) {
    return new Pointer("remove", query(args), this.col, this.origin)
  }

  createColumn(name: string, type: string) {
    return new Pointer("createColumn", [name, type], this.col, this.origin)
  }

  direct(q: string, f: (err: Error, res: any) => void) {
    logger.warn("Direct query: " + q)
    this.origin.query(q, f)
  }
}
