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
import { logger } from "../../../game/src/utils/jjlog"
import { Express, Response } from "express"
import { config } from "../../../game/src/config"

type LangFile = Record<string, Record<string, string>>

const Language = {
  ko_KR: require("../lang/ko_KR.json") as LangFile,
  en_US: require("../lang/en_US.json") as LangFile,
}

export const MOBILE_AVAILABLE = ["portal", "main", "kkutu"]

const updateLanguage = () => {
  for (const i in Language) {
    const src = `../Web/lang/${i}.json`

    delete require.cache[require.resolve(src)]
    Language[i as keyof typeof Language] = require(src)
  }
}

const getLanguage = (
  locale: keyof typeof Language,
  page: string,
  shop: boolean
) => {
  const L = Language[locale] || {}
  const R: Record<string, string> = {}

  for (const i in L.GLOBAL) R[i] = L.GLOBAL[i]
  if (shop) for (const i in L.SHOP) R[i] = L.SHOP[i]
  for (const i in L[page]) R[i] = L[page][i]
  if (R["title"]) R["title"] = `[${process.env["KKT_SV_NAME"]}] ${R["title"]}`

  return R
}

export const page = (req: any, res: Response, file: string, data?: any) => {
  if (!data) data = {}
  if (req.session.createdAt) {
    if (Date.now() - req.session.createdAt > 3600000) {
      delete req.session.profile
    }
  } else {
    req.session.createdAt = new Date()
  }

  const addr: string = req.ip || ""
  const sid: string = req.session.id || ""

  data.published = config.isPublic
  data.lang = req.query.locale || "ko_KR"
  if (!Language[data.lang as keyof typeof Language]) data.lang = "ko_KR"
  // URL ...?locale=en_US will show the page in English

  // if(STATIC) data.static = STATIC[data.lang];
  data.season = config.SEASON
  data.season_pre = config.SEASON_PRE

  data.locale = getLanguage(
    data.lang,
    data._page || file.split("_")[0],
    data._shop
  )
  data.session = req.session

  if (/mobile/i.test(req.get("user-agent")) || req.query.mob) {
    data.mobile = true
    if (req.query.pc) {
      data.as_pc = true
      data.page = file
    } else if (MOBILE_AVAILABLE.includes(file)) {
      data.page = "m_" + file
    } else {
      data.mobile = false
      data.page = file
    }
  } else {
    data.page = file
  }

  logger.info(
    `${addr.slice(7)}@${sid.slice(0, 10)} ${data.page}, ${JSON.stringify(
      req.params
    )}`
  )

  res.render(data.page, data, (err: Error, html: string) => {
    if (err) res.send(err.toString())
    else res.send(html)
  })
}

export const init = (Server: Express, shop: boolean) => {
  Server.get("/language/:page/:lang", (req, res) => {
    let page = req.params.page.replace(/_/g, "/")
    const lang = req.params.lang as keyof typeof Language

    if (page.substring(0, 2) == "m/") page = page.slice(2)
    if (page === "portal") page = "kkutu"
    res.send(
      "window.L = " + JSON.stringify(getLanguage(lang, page, shop)) + ";"
    )
  })

  Server.get("/language/flush", (req, res) => {
    updateLanguage()
    res.sendStatus(200)
  })
}
