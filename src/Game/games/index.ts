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

import { DICData } from "../kkutu"
import { Tail } from "../../sub/lizard"
import Room from "../classes/Room"
import Robot from "../classes/Robot"
import Client from "../classes/Client"

export class Game {
  // TODO: DB는 import 하는 걸로 변경해야 함
  constructor(public room: Room, public DB: any, protected DIC: DICData) {}

  getTitle() {
    return new Tail()
  }

  async roundReady() {}
  async turnStart(force) {}
  async turnEnd() {}
  async submit(client: Client, text: string, data?: any) {}
  async readyRobot(robot: Robot) {}

  getScore(text: string, delay: number, ignoreMission: boolean): number {
    return 0
  }
}

export * from "./classic"
export * from "./crossword"
export * from "./daneo"
