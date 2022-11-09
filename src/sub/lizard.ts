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

export const all = (tails: Tail[]) => {
  const R = new Tail([])
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
  callback?: (data: any, i: number) => any
  _i: number = 0
  value?: any

  constructor(public returns?: any[]) {}

  // 데이터를 지정된 콜백 메서드에 넣고 실행함
  // data는 this.value에 저장함
  go(data: any) {
    if (this.callback) this.callback(data, this._i)
    else this.value = data
  }

  // 만약 value가 지정되지 않은 경우 this.callback은 실행되지 않고, this.callback을 해당 함수로 지정함
  // 만약 value가 지정된 경우 then에서 지정한 콜백 함수를 실행함
  then(cb: (data: any, i: number) => any, __i?: number) {
    this._i = __i

    if (this.value === undefined) this.callback = cb
    else cb(this.value, __i)
  }
}
