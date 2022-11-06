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

// TODO: tslog로 바꾸기
function callLog(text: string) {
  const date = new Date()
  const o = {
    year: 1900 + date.getFullYear(),
    month: date.getMonth() + 1,
    date: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  }

  for (const i in o) {
    if (o[i] < 10) o[i] = "0" + o[i]
    else o[i] = o[i].toString()
  }
  console.log(
    `[${o.year}-${o.month}-${o.date} ${o.hour}:${o.minute}:${o.second}] ${text}`
  )
}

export const log = (text: string) => callLog(text)
export const info = (text: string) => callLog(text)
export const success = (text: string) => callLog(text)
export const alert = (text: string) => callLog(text)
export const warn = (text: string) => callLog(text)
export const error = (text: string) => callLog(text)
