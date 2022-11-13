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

import { Tail } from "../../sub/lizard"
import Room from "../classes/Room"
import Robot from "../classes/Robot"
import Client from "../classes/Client"

export class Game {
  constructor(public room: Room, protected DIC: Record<string, Client>) {}

  async getTitle() {
    await new Promise((resolve) => setTimeout(resolve, 500))
    return "①②③④⑤⑥⑦⑧⑨⑩"
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
export * from "./hunmin"
export * from "./typing"
export * from "./jaqwi"
