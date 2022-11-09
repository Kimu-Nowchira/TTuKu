import _knex from "knex"
import { config } from "../config"

const connection = `postgres://${config.PG_USER}:${config.PG_PASSWORD}@${config.PG_HOST}:${config.PG_PORT}/${config.PG_DATABASE}`

export const knex = _knex({
  client: "pg",
  connection,
})

interface IWord {
  _id: string
  type: string
  mean: string
  hit: number
  flag: number
  theme: string
}

export const koWordTable = knex<IWord>("kkutu_ko")
export const enWordTable = knex<IWord>("kkutu_en")

export const koMannerTable = knex("kkutu_manner_ko")
export const enMannerTable = knex("kkutu_manner_en")

// export const koInjeongTable = knex("kkutu_injeong")

interface ICrossWordData {
  _id: string
  map: string
  data: string
}

export const koCrossWordTable = knex<ICrossWordData>("kkutu_cw_ko")

interface IShopItem {
  _id: string
  cost: number
  hit: number
  term: number
  group: string
  updatedAt: number
  options: {
    gEXP?: number
    gMNY?: number
    hMNY?: number
    hEXP?: number
    gif?: boolean
  }
}

export const ShopTable = knex<IShopItem>("kkutu_shop")

interface IShopDescription {
  _id: string
  name_ko_KR: string
  desc_ko_KR: string
  name_en_US: string
  desc_en_US: string
}

export const ShopDescriptionTable = knex<IShopDescription>("kkutu_shop_desc")

interface SessionData {
  id: string
  profile: {
    authType: string
    id: string
    name: string
    title: string
    image: string
    token: string
    sid: string
  }
  createdAt: number
}

export const Session = knex<SessionData>("session")

interface IUser {
  _id: string
  money: number
  kkutu: {
    score: number
    playTime: number
    connectDate: number
    record: Record<string, [number, number, number, number]>
  }
  lastLogin?: number
  box?: Record<string, number>
  equip?: any
  exordial?: string
  black?: string
  blockeduntil?: string
  server: string
  password?: string
  friends: Record<string, string>
}

export const UserTable = knex<IUser>("users")

interface IPBlockData {
  _id: string
  reasonblocked: string
  ipblockeduntil: string
}

export const IPBlockTable = knex<IPBlockData>("ip_block")
