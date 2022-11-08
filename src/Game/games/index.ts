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

import { Room } from "../kkutu"
import { Tail } from "../../sub/lizard"

export class Game {
  constructor(private room: Room) {}

  getTitle() {
    return new Tail()
  }

  roundReady() {}
  turnStart() {}
  turnEnd() {}
  submit() {}
  getScore(): number {
    return 0
  }
}

// <TEMPLATE>
// export const init = (_DB, _DIC, _ROOM) => {
//   DB = _DB
//   DIC = _DIC
//   ROOM = _ROOM
// }
