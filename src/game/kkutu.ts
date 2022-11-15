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
import Room from "./classes/Room"
import Client from "./classes/Client"
import { ClientExportData, IShopItem, RoomExportData } from "./types"
import { kkutu_shop } from "../Web/db"

export let GUEST_PERMISSION: Record<string, boolean> = {}

export const SHOP: Record<string, IShopItem> = {}

export let DIC: Record<string, Client> = {}
export let ROOM: Record<number, Room> = {}
export let CHAN: Record<number, ClusterWorker> = {}

// TODO: ID 생성 메서드를 새로 만드는 것이 좋음
export let _rid: number = 100

export const NIGHT = false

export let onClientMessage: (client: Client, msg: any) => any
export let onClientClosed: (client: Client) => any

export const init = (
  _DIC: Record<string, Client>,
  _ROOM: Record<number, Room>,
  _GUEST_PERMISSION: Record<string, boolean>,
  _CHAN: Record<string, ClusterWorker> | undefined,
  events: {
    onClientMessage: (client: Client, msg: any) => any
    onClientClosed: (client: Client) => any
  }
) => {
  DIC = _DIC
  ROOM = _ROOM
  GUEST_PERMISSION = _GUEST_PERMISSION
  CHAN = _CHAN

  onClientMessage = events.onClientMessage
  onClientClosed = events.onClientClosed

  kkutu_shop.find().on(($shop: IShopItem[]) => {
    $shop.forEach((item) => (SHOP[item._id] = item))
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

export const publish = (type: string, data, _room?: string | boolean) => {
  if (cluster.isPrimary) {
    for (const i in DIC) DIC[i].send(type, data)
  } else {
    if (type == "room")
      process.send({ type: "room-publish", data: data, password: _room })
    else for (const i in DIC) DIC[i].send(type, data)
  }
}

export const setRId = (id: number) => (_rid = id)
export const addRId = () => _rid++
