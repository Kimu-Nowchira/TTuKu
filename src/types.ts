import Robot from "./Game/classes/Robot"

export interface IUser {
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

export interface IWord {
  _id: string
  type: string
  mean: string
  hit: number
  flag: number
  theme: string
}

export interface ISession {
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

export interface IShopItem {
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

export interface IShopDescription {
  _id: string
  name_ko_KR: string
  desc_ko_KR: string
  name_en_US: string
  desc_en_US: string
}

export interface ICrossWordData {
  _id: string
  map: string
  data: string
}

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
  chain?: string[]
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

export interface ClientExportData {
  id: string
  guest: boolean
  game: {
    ready: boolean
    form: string
    team: number
    practice: number
    score: number
    item: any[]
  }
  profile: string | null
  place: number | null
  data: any | null
  money: number | null
  equip: any | null
  exordial: string | null
}

export interface RoomExportData {
  id: number
  channel: number
  title: string
  password: boolean
  limit: number
  mode: number
  round: number
  time: number
  master: string
  players: number[]
  readies: any
  gaming: boolean
  game: GameData
  practice: boolean
  opts: string[]
}
