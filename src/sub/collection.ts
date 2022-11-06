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
      .map(function (item, x) {
        return x ? `'${escape.literal(item)}'` : escape.ident(item)
      })
      .join("->") + `->>'${aEnd}'`
  )
}

// (JSON ENDPOINT) KEY
const asSKey = (val: string) => {
  if (val.indexOf(".") == -1) return asKey(val)
  const c = val.split(".").map(function (item, x) {
    return x ? escape.literal(item) : escape.ident(item)
  })

  return c.slice(0, c.length - 1).join("->") + "->>" + c[c.length - 1]
}

// VALUE
const asValue = (val: any) => {
  const type = typeof val

  if (val instanceof Array) return escape.literal("{" + val.join(",") + "}")
  if (type == "number") return val
  if (type == "string") return escape.literal(val)
  return escape.literal(JSON.stringify(val))
}

const Escape = (str: string, _a?: any, _b?: any, _c?: any, _d?: any) => {
  let i = 1
  const args = [str, _a, _b, _c, _d]

  return str.replace(/%([%sILQkKV])/g, function (_, type) {
    if ("%" == type) return "%"

    const arg = args[i++]
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
    }
  })
}

global.getType = function (obj: any) {
  if (obj === undefined) return ""

  const s = obj.constructor.toString()
  return s.slice(9, s.indexOf("("))
}

function query(_q: IArguments) {
  const res = []
  for (const i in _q) if (_q[i]) res.push(_q[i])
  return res
}

function oQuery(_q) {
  const res = []
  for (const i in _q) if (_q[i]) res.push([i, _q[i]])

  return res
}

function uQuery(q, id: string) {
  var i,
    res = [],
    noId = true

  for (i in q) {
    var c = q[i][0]

    if (q[i][0] == "_id") {
      noId = false
    } else if (c.split)
      if ((c = c.split(".")).length > 1) {
        var jo = {},
          j = jo

        q[i][0] = c.shift()
        while (c.length > 1) {
          j = j[c.shift()] = {}
        }
        j[c.shift()] = q[i][1]
        q[i][1] = JSON.stringify(jo)
      }
    res.push([q[i][0], q[i][1]])
  }
  if (noId) res.push(["_id", id])
  return res
}

function sqlSelect(q) {
  if (!Object.keys(q).length) return "*"

  return q
    .map(function (item) {
      if (!item[1]) throw new Error(item[0])
      return Escape("%K", item[0])
    })
    .join(", ")
}

function sqlWhere(q) {
  if (!Object.keys(q).length) return "TRUE"

  function wSearch(item) {
    let c

    if ((c = item[1]["$not"]) !== undefined)
      return Escape("NOT (%s)", wSearch([item[0], c]))
    if ((c = item[1]["$nand"]) !== undefined)
      return Escape("%K & %V = 0", item[0], c)
    if ((c = item[1]["$lte"]) !== undefined) return Escape("%K<=%V", item[0], c)
    if ((c = item[1]["$gte"]) !== undefined) return Escape("%K>=%V", item[0], c)
    if ((c = item[1]["$in"]) !== undefined) {
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
        c
          .map(function (i) {
            return Escape("%V", i)
          })
          .join(",")
      )
    }
    if (item[1] instanceof RegExp)
      return Escape("%K ~ %L", item[0], item[1].source)
    return Escape("%K=%V", item[0], item[1])
  }
  return q.map(wSearch).join(" AND ")
}

function sqlSet(q, inc?: boolean) {
  if (!q) {
    logger.warn("[sqlSet] Invalid query.")
    return null
  }
  var doN = inc
      ? function (k, v) {
          return Escape("%K=%K+%V", k, k, v)
        }
      : function (k, v) {
          return Escape("%K=%V", k, v)
        },
    doJ = inc
      ? function (k, p, ok, v) {
          logger.warn("[sqlSet] Cannot increase a value in JSON object.")
          return null //Escape("%K=jsonb_set(%K,%V,CAST(CAST(%k AS bigint)+%V AS text),true)", k, k, p, ok, Number(v));
        }
      : function (k, p, ok, v) {
          return Escape("%K=jsonb_set(%K,%V,%V,true)", k, k, p, v)
        }
  return q
    .map(function (item) {
      var c = item[0].split(".")

      if (c.length == 1) {
        return doN(item[0], item[1])
      }
      /* JSON 값 내부를 수정하기
			1. UPSERT 할 수 없다.
			2. 한 쿼리에 여러 값을 수정할 수 없다.
		*/
      if (typeof item[1] == "number") item[1] = item[1].toString()
      return doJ(c[0], c.slice(1), item[0], item[1])
    })
    .join(", ")
}

function sqlIK(q) {
  return q
    .map(function (item) {
      return Escape("%K", item[0])
    })
    .join(", ")
}

function sqlIV(q) {
  return q
    .map(function (item) {
      return Escape("%V", item[1])
    })
    .join(", ")
}

function isDataAvailable(data, chk) {
  var i, j
  var path
  var cursor

  if (data == null) return false
  for (i in chk) {
    cursor = data
    path = i.split(".")
    for (j in path) {
      if (cursor[path[j]] === null) return false
      if (cursor.hasOwnProperty(path[j]) == chk[i]) cursor = data[path[j]]
      else return false
    }
  }

  return true
}

class Pointer {
  // 정체를 모르겠음
  second: any = {}
  sorts: null | any[] = null
  findLimit = 0

  constructor(
    private origin: any,
    private col: string,
    private mode: string,
    private q: any[]
  ) {}

  /* on: 입력받은 쿼리를 실행시킨다.
    @f		콜백 함수
    @chk	정보가 유효할 조건
    @onFail	유효하지 않은 정보일 경우에 대한 콜백 함수
  */

  on(f, chk, onFail) {
    let sql: string = ""
    let sq = this.second["$set"]
    let uq

    const callback = (err: Error, doc) => {
      if (f) {
        if (chk) {
          if (isDataAvailable(doc, chk)) f(doc)
          else {
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

    const preCB = (err: Error, res) => {
      if (err) {
        logger.error("Error when querying: " + sql)
        logger.error("Context: " + err.toString())
        if (onFail) {
          logger.warn("onFail calling...")
          onFail(err)
        }
        return
      }
      if (res) {
        if (this.mode === "findOne") {
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
        sql = Escape("SELECT %s FROM %I", sqlSelect(this.second), this.col)
        if (this.q) sql += Escape(" WHERE %s", sqlWhere(this.q))
        if (this.sorts)
          sql += Escape(
            " ORDER BY %s",
            this.sorts
              .map(function (item) {
                return item[0] + (item[1] == 1 ? " ASC" : " DESC")
              })
              .join(",")
          )
        if (this.findLimit) sql += Escape(" LIMIT %V", this.findLimit)
        break
      case "insert":
        sql = Escape(
          "INSERT INTO %I (%s) VALUES (%s)",
          this.col,
          sqlIK(this.q),
          sqlIV(this.q)
        )
        break
      case "update":
        if (this.second["$inc"]) {
          sq = sqlSet(this.second["$inc"], true)
        } else {
          sq = sqlSet(sq)
        }
        sql = Escape("UPDATE %I SET %s", this.col, sq)
        if (this.q) sql += Escape(" WHERE %s", sqlWhere(this.q))
        break
      case "upsert":
        // 업데이트 대상을 항상 _id(q의 가장 앞 값)로 가리키는 것으로 가정한다.
        uq = uQuery(sq, this.q[0][1])
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
        if (this.q) sql += Escape(" WHERE %s", sqlWhere(this.q))
        break
      case "createColumn":
        sql = Escape(
          "ALTER TABLE %I ADD COLUMN %K %I",
          this.col,
          this.q[0],
          this.q[1]
        )
        break
      default:
        logger.warn("Unhandled mode: " + this.mode)
    }
    if (!sql) return logger.warn("SQL is undefined. This call will be ignored.")
    // logger.log("Query: " + sql.slice(0, 100));
    logger.info(sql)
    this.origin.query(sql, preCB)
    /*if(_my.findLimit){

      c = my.source[mode](q, flag, { limit: _my.findLimit }, preCB);
    }else{
      c = my.source[mode](q, _my.second, flag, preCB);
    }*/
    return sql
  }
  // limit: find 쿼리에 걸린 문서를 필터링하는 지침을 정의한다.
  limit(_data: any) {
    if (global.getType(_data) == "Number") {
      this.findLimit = _data
    } else {
      this.second = query(arguments)
      this.second.push(["_id", true])
    }
    return this
  }
  sort(_data: any) {
    this.sorts =
      global.getType(_data) == "Array" ? query(arguments) : oQuery(_data)
    return this
  }
  // set: update 쿼리에 걸린 문서를 수정하는 지침을 정의한다.
  set(_data: any) {
    this.second["$set"] =
      global.getType(_data) == "Array" ? query(arguments) : oQuery(_data)
    return this
  }
  // soi: upsert 쿼리에 걸린 문서에서, insert될 경우의 값을 정한다. (setOnInsert)
  soi(_data: any) {
    this.second["$setOnInsert"] =
      global.getType(_data) == "Array" ? query(arguments) : oQuery(_data)
    return this
  }
  // inc: update 쿼리에 걸린 문서의 특정 값을 늘인다.
  inc(_data: any) {
    this.second["$inc"] =
      global.getType(_data) == "Array" ? query(arguments) : oQuery(_data)
    return this
  }
}

export class RedisTable {
  constructor(private origin: any, private key: string) {}

  putGlobal(id: string, score: number) {
    var R = new Tail()

    this.origin.zadd([this.key, score, id], (err: Error, res) => {
      R.go(id)
    })
    return R
  }

  getGlobal(id: string) {
    var R = new Tail()

    this.origin.zrevrank([this.key, id], function (err: Error, res) {
      R.go(res)
    })
    return R
  }
  getPage(pg, lpp) {
    var R = new Tail()

    this.origin.zrevrange(
      [this.key, pg * lpp, (pg + 1) * lpp - 1, "WITHSCORES"],
      function (err, res) {
        var A = []
        var rank = pg * lpp
        var i,
          len = res.length

        for (i = 0; i < len; i += 2) {
          A.push({ id: res[i], rank: rank++, score: res[i + 1] })
        }
        R.go({ page: pg, data: A })
      }
    )
    return R
  }
  getSurround(id: string, rv: number) {
    const R = new Tail()

    rv = rv || 8
    this.origin.zrevrank([this.key, id], (err: Error, res) => {
      const range = [Math.max(0, res - Math.round(rv / 2 + 1)), 0]

      range[1] = range[0] + rv - 1
      this.origin.zrevrange(
        [this.key, range[0], range[1], "WITHSCORES"],
        (err: Error, res) => {
          if (!res) return R.go({ target: id, data: [] })

          const A = []
          const len: number = res.length

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

export class PostgresTable {
  source: string = ""

  constructor(private origin: any, private col: string) {
    this.source = col
  }

  // pointer
  findOne() {
    return new Pointer(this.origin, this.col, "findOne", query(arguments))
  }
  find() {
    return new Pointer(this.origin, this.col, "find", query(arguments))
  }
  insert() {
    return new Pointer(this.origin, this.col, "insert", query(arguments))
  }
  update() {
    return new Pointer(this.origin, this.col, "update", query(arguments))
  }
  upsert() {
    return new Pointer(this.origin, this.col, "upsert", query(arguments))
  }
  remove() {
    return new Pointer(this.origin, this.col, "remove", query(arguments))
  }
  createColumn(name: string, type: string) {
    return new Pointer(this.origin, this.col, "createColumn", [name, type])
  }
  direct(q, f) {
    logger.warn("Direct query: " + q)
    this.origin.query(q, f)
  }
}

// export class Agent {
//   table: typeof RedisTable | typeof PostgresTable = RedisTable
//
//   constructor(type: "Redis" | "Postgres", private origin: PoolClient) {
//     switch (type) {
//       case "Redis":
//         this.table = RedisTable
//         break
//       case "Postgres":
//         this.table = PostgresTable
//     }
//   }
//
//   Table(colOrKey: string) {
//     return new this.table(this.origin, colOrKey)
//   }
// }

/*exports.Mongo = function(col){
	var my = this;
	var pointer = function(mode, q, flag){
		var _my = this;
		_my.second = {};
		_my.sorts = null;
		
		this.on = function(f, chk, onFail){
			var c;
			
			function preCB(err, doc){
				if(mode == "find"){
					if(_my.sorts){
						doc = doc.sort(_my.sorts);
					}
					doc.toArray(callback);
				}else callback(err, doc);
			}
			function callback(err, doc){
				if(err){
					logger.error("Error when querying: "+JSON.stringify(q));
					logger.error("Context: "+err.toString());
					return;
				}
				
				if(f){
					if(chk){
						if(isDataAvailable(doc, chk)) f(doc);
						else{
							if(onFail) onFail(doc);
							else if(DEBUG) throw new Error("The data from "+mode+"["+JSON.stringify(q)+"] was not available.");
							else logger.warn("The data from ["+JSON.stringify(q)+"] was not available. Callback has been canceled.");
						}
					}else f(doc);
				}
			}
			
			if(_my.findLimit){
				c = my.source[mode](q, flag, { limit: _my.findLimit }, preCB);
			}else{
				c = my.source[mode](q, _my.second, flag, preCB);
			}
		};
		// limit: find 쿼리에 걸린 문서를 필터링하는 지침을 정의한다.
		this.limit = function(_data){
			if(global.getType(_data) == "Number"){
				_my.findLimit = _data;
			}else{
				_my.second = query(arguments);
			}
			return this;
		};
		this.sort = function(_data){
			_my.sorts = query(arguments);
			return this;
		};
		// set: update 쿼리에 걸린 문서를 수정하는 지침을 정의한다.
		this.set = function(_data){
			_my.second['$set'] = (global.getType(_data) == "Array") ? query(arguments) : _data;
			return this;
		};
		// soi: upsert 쿼리에 걸린 문서에서, insert될 경우의 값을 정한다. (setOnInsert)
		this.soi = function(_data){
			_my.second['$setOnInsert'] = (global.getType(_data) == "Array") ? query(arguments) : _data;
			return this;
		};
		// inc: update 쿼리에 걸린 문서의 특정 값을 늘인다.
		this.inc = function(_data){
			_my.second = { $inc: (global.getType(_data) == "Array") ? query(arguments) : _data };
			return this;
		};
	};

	my.source = col;
	my.findOne = function(){
		return new pointer("findOne", query(arguments));
	};
	my.find = function(){
		return new pointer("find", query(arguments));
	};
	my.update = function(){
		return new pointer("update", query(arguments));
	};
	my.upsert = function(){
		return new pointer("update", query(arguments), { upsert: true });
	};
	my.remove = function(){
		return new pointer("remove", query(arguments));
	};
};*/
