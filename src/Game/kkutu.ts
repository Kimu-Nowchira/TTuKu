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

import cluster, { Worker as ClusterWorker } from "node:cluster"
import { GAME_TYPE } from "../const"
import { logger } from "../sub/jjlog"
import { WebSocket } from "ws"
import Room from "./classes/Room"
import Client from "./classes/Client"
import { ClientExportData, RoomExportData } from "./types"

export let GUEST_PERMISSION: Record<string, boolean> = {}

export let DB
export let SHOP

export type IRooms = Record<number, Room>
export type DICData = Record<string, Client>

export let DIC: DICData = {}
export let ROOM: IRooms = {}
export let CHAN: Record<number, ClusterWorker> = {}

// TODO: ID 생성 메서드를 새로 만드는 것이 좋음
export let _rid: number = 100

export const NIGHT = false

export let onClientMessage: any
export let onClientClosed: any

export const init = (
  _DB,
  _DIC: DICData,
  _ROOM: IRooms,
  _GUEST_PERMISSION: Record<string, boolean>,
  _CHAN: Record<string, ClusterWorker> | undefined,
  events: {
    onClientMessage: any
    onClientClosed: any
  }
) => {
  DB = _DB
  DIC = _DIC
  ROOM = _ROOM
  GUEST_PERMISSION = _GUEST_PERMISSION
  CHAN = _CHAN

  onClientMessage = events.onClientMessage
  onClientClosed = events.onClientClosed

  DB.kkutu_shop.find().on(($shop) => {
    SHOP = {}

    $shop.forEach((item) => {
      SHOP[item._id] = item
    })
  })
}

export const getUserList = () => {
  const res: Record<string, ClientExportData> = {}
  for (const i in DIC) res[i] = DIC[i].getData()
  return res
}

export const getRoomList = () => {
  const res: Record<string, RoomExportData> = {}
  for (const i in ROOM) res[i] = ROOM[i].getData()
  return res
}

export const narrate = (list, type: string, data) =>
  list.forEach((v) => DIC[v]?.send(type, data))

export const publish = (type: string, data, _room?: string) => {
  if (cluster.isPrimary) {
    for (const i in DIC) DIC[i].send(type, data)
  } else {
    if (type == "room")
      process.send({ type: "room-publish", data: data, password: _room })
    else
      for (const i in DIC) {
        DIC[i].send(type, data)
      }
  }
}

export class WebServer {
  constructor(public socket: WebSocket) {
    socket.on("message", (msg: any) => {
      try {
        msg = JSON.parse(msg)
      } catch (e) {
        return logger.error("JSON.parse() failed: " + msg)
      }

      switch (msg.type) {
        case "seek":
          this.send("seek", { value: Object.keys(DIC).length })
          break
        case "narrate-friend":
          narrate(msg.list, "friend", {
            id: msg.id,
            s: msg.s,
            stat: msg.stat,
          })
      }
    })
  }

  send(type: string, data: any) {
    if (this.socket.readyState === 1)
      this.socket.send(JSON.stringify({ ...(data || {}), type }))
  }
}

export const setRId = (id: number) => (_rid = id)
export const addRId = () => _rid++
