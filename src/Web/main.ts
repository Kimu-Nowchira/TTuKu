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

import WS from "ws"
import Express from "express"
import Exession from "express-session"
import * as https from "https"
import passport from "passport"

import {
  EN_INJEONG,
  EN_THEME,
  GAME_TYPE,
  IJP_EXCEPT,
  IS_SECURED,
  KO_INJEONG,
  KO_THEME,
  MAIN_PORTS,
  RULE,
  OPTIONS,
  GROUPS,
  CATEGORIES,
  AVAIL_EQUIP,
  MOREMI_PART,
  KKUTU_MAX,
} from "../const"
import { urlencoded } from "body-parser"
import { logger } from "../sub/jjlog"
import { config } from "../config"
import Secure from "../sub/secure"
import * as WebInit from "../sub/webinit"
import { init as dbInit, kkutu_shop_desc, session } from "../sub/db"

import { run as adminRun } from "./routes/admin"
import { run as consumeRun } from "./routes/consume"
import { run as majorRun } from "./routes/major"
import { run as loginRun } from "./routes/login"

type LangFile = Record<string, Record<string, string>>
const Language = {
  ko_KR: require("./lang/ko_KR.json") as LangFile,
  en_US: require("./lang/en_US.json") as LangFile,
}

const gameServers: GameClient[] = []

const Server = Express()

// TODO: 임시 코드 - 추후 삭제 필요
global.isPublic = config.isPublic

declare module "express-session" {
  interface SessionData {
    passport: any
    profile: any
    id: string
    admin: boolean
    injBefore: number
  }
}

export const run = async () => {
  logger.info("<< KKuTu Web >>")

  if (!config.isPublic) logger.info("Disable public mode.")

  Server.set("views", __dirname + "/views")
  Server.set("view engine", "pug")
  Server.use(Express.static(__dirname + "/public"))
  Server.use(urlencoded({ extended: true }))
  Server.use(
    Exession({
      /* use only for redis-installed
    store: new Redission({
      client: Redis.createClient(),
      ttl: 3600 * 12
    }),*/
      secret: "kkutu",
      resave: false,
      saveUninitialized: true,
    })
  )

  Server.use(passport.initialize())
  Server.use(passport.session())
  Server.use((req, res, next) => {
    if (req.session.passport) delete req.session.passport
    next()
  })

  Server.use((req, res, next) => {
    if (IS_SECURED) {
      if (req.protocol == "http") {
        let url = "https://" + req.get("host") + req.path
        res.status(302).redirect(url)
      } else {
        next()
      }
    } else {
      next()
    }
  })

  WebInit.init(Server, true)

  MAIN_PORTS.forEach((v: number, i: number) => {
    const KEY = process.env["WS_KEY"] || ""
    const protocol = IS_SECURED ? "wss" : "ws"

    gameServers[i] = new GameClient(
      KEY,
      `${protocol}://${config.GAME_SERVER_HOST}:${v}/${KEY}`
    )
  })

  adminRun(Server, WebInit.page)
  consumeRun(Server, WebInit.page)
  majorRun(Server, WebInit.page)
  loginRun(Server, WebInit.page)

  Server.get("/", (req, res) => {
    const server = parseInt(req.query.server?.toString() || "")
    // if (!server) logger.error("Server is not defined")

    const onFinish = ($doc) => {
      let id = req.session.id

      if ($doc) {
        req.session.profile = $doc.profile
        id = $doc.profile.sid
      } else {
        delete req.session.profile
      }
      WebInit.page(req, res, MAIN_PORTS[server] ? "kkutu" : "portal", {
        _page: "kkutu",
        _id: id,
        PORT: MAIN_PORTS[server],
        HOST: req.hostname,
        PROTOCOL: IS_SECURED ? "wss" : "ws",
        TEST: req.query.test,
        MOREMI_PART,
        AVAIL_EQUIP,
        CATEGORIES,
        GROUPS,
        MODE: GAME_TYPE,
        RULE,
        OPTIONS,
        KO_INJEONG,
        EN_INJEONG,
        KO_THEME,
        EN_THEME,
        IJP_EXCEPT,
        ogImage: "http://kkutu.kr/img/kkutu/logo.png",
        ogURL: "http://kkutu.kr/",
        ogTitle: "글자로 놀자! 끄투 온라인",
        ogDescription: "끝말잇기가 이렇게 박진감 넘치는 게임이었다니!",
      })
    }

    session.findOne(["_id", req.session.id]).on(($ses) => {
      // var sid = (($ses || {}).profile || {}).sid || "NULL";
      if (config.isPublic) {
        onFinish($ses)
        // DB.jjo_session.findOne([ '_id', sid ]).limit([ 'profile', true ]).on(onFinish);
      } else {
        if ($ses) $ses.profile.sid = $ses._id
        onFinish($ses)
      }
    })
  })

  Server.get("/servers", (_req, res) => {
    const list: Array<undefined | string> = []

    gameServers.forEach(function (v, i) {
      list[i] = v.seek
    })
    res.send({ list: list, max: KKUTU_MAX })
  })

  Server.get("/legal/:page", (req, res) => {
    WebInit.page(req, res, "legal/" + req.params.page)
  })

  await dbInit()

  setInterval(function () {
    const q = ["createdAt", { $lte: Date.now() - 3600000 * 12 }] as [
      string,
      { $lte: number }
    ]

    session.remove(q).on()
  }, 600000)
  setInterval(function () {
    gameServers.forEach((v) => {
      if (v.socket) v.socket.send(`{"type":"seek"}`)
      else v.seek = undefined
    })
  }, 4000)
  logger.info("DB is ready.")

  kkutu_shop_desc.find().on(($docs) => {
    const flush = (lang: keyof typeof Language) => {
      let db

      Language[lang].SHOP = db = {}
      for (const j in $docs) {
        db[$docs[j]._id] = [$docs[j][`name_${lang}`], $docs[j][`desc_${lang}`]]
      }
    }

    for (const i in Language) flush(i as keyof typeof Language)
  })

  Server.listen(80)

  if (IS_SECURED) {
    const options = Secure()
    https.createServer(options, Server).listen(443)
  }
}

class GameClient {
  socket: WS
  seek?: string

  constructor(public id: string, public url: string) {
    this.socket = new WS(url, {
      perMessageDeflate: false,
      rejectUnauthorized: false,
    })

    this.socket.on("open", () => {
      logger.info(`Game server #${this.id} connected`)
    })

    this.socket.on("error", (err) => {
      logger.warn(`Game server #${this.id} has an error: ${err.toString()}`)
    })

    this.socket.on("close", (code) => {
      logger.error(`Game server #${this.id} closed: ${code}`)
      this.socket.removeAllListeners()
      // delete this.socket
    })

    this.socket.on("message", (data_) => {
      const data = JSON.parse(data_.toString())

      switch (data.type) {
        case "seek":
          this.seek = data.value
          break
        case "narrate-friend":
          for (const i in data.list) {
            gameServers[Number(i)].send("narrate-friend", {
              id: data.id,
              s: data.s,
              stat: data.stat,
              list: data.list[i],
            })
          }
          break
        default:
      }
    })
  }

  send(type: string, data: any) {
    if (!data) data = {}
    data.type = type

    this.socket.send(JSON.stringify(data))
  }
}
