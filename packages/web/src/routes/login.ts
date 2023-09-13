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

import passport from "passport"
import { logger } from "../../../game/src/utils/jjlog"
import { session, users } from "../../../game/src/utils/db"
import { config } from "../../../game/src/config"
import { DiscordAuth } from "../auth/discordAuth"
import { Express } from "express"

const authModules = [DiscordAuth]

const authProcess = (req, accessToken, $p, done) => {
  $p.token = accessToken
  $p.sid = req.session.id

  const now = Date.now()
  $p.sid = req.session.id
  req.session.admin = config.ADMIN.includes($p.id)
  req.session.authType = $p.authType

  session
    .upsert(["_id", req.session.id])
    .set({
      profile: $p,
      createdAt: now,
    })
    .onAsync()
    .then()

  users.findOne(["_id", $p.id]).on(() => {
    req.session.profile = $p
    users.update(["_id", $p.id]).set(["lastLogin", now]).on()
  })

  done(null, $p)
}

export const run = (Server: Express, page) => {
  // passport configure
  passport.serializeUser((user, done) => {
    done(null, user)
  })

  passport.deserializeUser((obj, done) => {
    done(null, obj)
  })

  const strategyList = {}

  for (let auth of authModules) {
    try {
      Server.get(
        "/login/" + auth.config.vendor,
        passport.authenticate(auth.config.vendor)
      )
      Server.get(
        "/login/" + auth.config.vendor + "/callback",
        passport.authenticate(auth.config.vendor, {
          successRedirect: "/",
          failureRedirect: "/loginfail",
        })
      )

      passport.use(
        new auth.config.strategy(
          auth.strategyConfig,
          auth.strategy(authProcess)
        )
      )

      strategyList[auth.config.vendor] = {
        vendor: auth.config.vendor,
        displayName: auth.config.displayName,
        color: auth.config.color,
        fontColor: auth.config.fontColor,
      }

      logger.info(`OAuth Strategy ${auth.authType} loaded successfully.`)
    } catch (error) {
      logger.warn(`OAuth Strategy ${auth.authType} is not loaded`)
      logger.warn(error.message)
    }
  }

  Server.get("/login", async (req, res) => {
    if (global.isPublic) {
      page(req, res, "login", {
        _id: req.session.id,
        text: req.query.desc,
        loginList: strategyList,
      })
    } else {
      const now = Date.now()
      const id = req.query.id || "ADMIN"
      const lp = {
        id: id,
        title: "LOCAL #" + id,
        birth: [4, 16, 0],
        _age: { min: 20, max: undefined },
      }

      await session
        .upsert(["_id", req.session.id])
        .set(["profile", JSON.stringify(lp)], ["createdAt", now])
        .onAsync()

      users.update(["_id", id]).set(["lastLogin", now]).onAsync().then()

      req.session.admin = true
      req.session.profile = lp
      res.redirect("/")
    }
  })

  Server.get("/logout", (req, res) => {
    if (!req.session.profile) return res.redirect("/")

    // callback이 필수여서 빈 함수를 넣음
    req.session.destroy(() => {})
    res.redirect("/")
  })

  Server.get("/loginfail", (req, res) => {
    page(req, res, "loginfail")
  })
}
