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

export const all = (tails: any[]) => {
  const R = new exports.Tail([])
  let left: number = tails.length

  const onEnded = (data: Object, __i: number) => {
    R.returns[__i] = data
    if (--left == 0) R.go(R.returns)
  }

  if (!left) R.go(true)
  else
    for (const i in tails) {
      if (tails[i]) tails[i].then(onEnded, Number(i))
      else left--
    }

  return R
}

export class Tail {
  callback: Function | undefined
  _i: number = 0
  value: Object | undefined

  constructor(public returns: any[]) {}

  go(data: Object) {
    if (this.callback) this.callback(data, this._i)
    else this.value = data
  }

  then(cb: Function, __i: number) {
    this._i = __i

    if (this.value === undefined) this.callback = cb
    else cb(this.value, __i)
  }
}
