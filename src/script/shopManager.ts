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

// 지정한 경로의 파일 내용을 토대로 상점의 아이템을 업데이트하는 스크립트

import { readFile } from "fs"
import { logger } from "../sub/jjlog"

import { init as dbInit, kkutu_shop } from "../Web/db"

/* 상품 group 명세: NIK	이름 스킨; 이름의 색상을 변경합니다. */
const run = async () => {
  logger.info("KKuTu Goods Manager")

  await dbInit()

  const data = {
    type: process.argv[2],
    url: process.argv[3],
    list: [],
  }

  data.list = await new Promise((res, rej) => {
    readFile(data.url, (err, _file) => {
      if (err) {
        logger.error("URL not found: " + data.url)
        rej(err)
      } else {
        const dv = JSON.parse(_file.toString())
        res(dv)
      }
    })
  })

  logger.info("DB is ready.")

  switch (data.type) {
    case "A":
      /* 추가/수정
		{
			"id":		_id,
			"group":	카테고리,
			"title":	제목,
			"cost":		가격,
			"term":		기간 (0이면 무한),
			"desc":		설명
		}
			*/
      for (const o of data.list) {
        logger.info(o)

        kkutu_shop
          .upsert(["_id", Number(o.id)])
          .set(
            ["group", o.group],
            ["title", o.title],
            ["cost", Number(o.cost)],
            ["term", Number(o.term)],
            ["desc", o.desc],
            ["updatedAt", new Date()]
          )
          .soi(["hit", 0])
          .on()
      }
      break

    default:
      logger.error("Unhandled type " + data.type)
      logger.info("Avails: A")
      process.exit()
  }
}

run().then()
