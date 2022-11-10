import { Robot } from "./kkutu"

export interface GameData {
  ready?: boolean
  form?: string
  team?: number
  practice?: number
  score?: number
  item?: any[]

  late?: boolean
  round?: number
  turn?: number
  seq?: any[]
  robots?: Robot[]

  title?: string
  // TODO: 이게 뭐여
  mission?: string | boolean | null

  loading?: boolean
  hum?: number

  // classic
  wordLength?: number
  dic?: any
  chain?: any
  theme?: any
  conso?: any
  prisoners?: any
  boards?: any
  means?: any

  roundTime?: number
  turnTime?: number
  char?: string
  subChar?: string
  turnAt?: number

  // crossword
  started?: boolean
  numQ?: number
  answers?: any
  mdb?: any
  roundAt?: number
  primary?: number
  themeBonus?: number
  meaned?: number
  hint?: any[]

  _rrt?: NodeJS.Timeout
  turnTimer?: NodeJS.Timeout
  hintTimer?: NodeJS.Timeout
  hintTimer2?: NodeJS.Timeout
  qTimer?: NodeJS.Timeout

  robotTimer?: NodeJS.Timeout
}

export interface UserData {
  id: number
  robot: boolean
  guest: boolean
  game: GameData
  target: number
  level: number
  ready: boolean

  data?: any
  place?: number
  equip?: any
  exordial?: any
}

export interface RoomData {
  id: number
  channel: number
  title: string
  password: string | boolean
  limit: number
  mode: number
  round: number
  time: number
  master: string
  players: any[]
  readies: any
  gaming: boolean
  game: GameData
  practice: string | boolean
  opts: any
}
