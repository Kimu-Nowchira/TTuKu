import _knex from "knex"
import { config } from "../config"
import {
  ICrossWordData,
  IPBlockData,
  ISession,
  IShopDescription,
  IShopItem,
  IUser,
  IWord,
} from "../game/types"

const connection = `postgres://${config.PG_USER}:${config.PG_PASSWORD}@${config.PG_HOST}:${config.PG_PORT}/${config.PG_DATABASE}`

export const knex = _knex({
  client: "pg",
  connection,
})

export const koWordTable = knex<IWord>("kkutu_ko")
export const enWordTable = knex<IWord>("kkutu_en")

export const koMannerTable = knex("kkutu_manner_ko")
export const enMannerTable = knex("kkutu_manner_en")

// export const koInjeongTable = knex("kkutu_injeong")

export const koCrossWordTable = knex<ICrossWordData>("kkutu_cw_ko")

export const ShopTable = knex<IShopItem>("kkutu_shop")
export const ShopDescriptionTable = knex<IShopDescription>("kkutu_shop_desc")

export const Session = knex<ISession>("session")
export const UserTable = knex<IUser>("users")

export const IPBlockTable = knex<IPBlockData>("ip_block")
