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

import { readFile } from "fs"

export const PROVERBS = {
  ko: [] as string[],
  en: [] as string[],
}

readFile(`${__dirname}/../../data/proverbs.txt`, (err, res) => {
  if (err) throw Error(err.toString())
  const db = res.toString().split("~~~")

  db.forEach((item) => {
    const lang = item.slice(0, 2) as keyof typeof PROVERBS

    PROVERBS[lang] = item.slice(3).split("\n")
  })
})
