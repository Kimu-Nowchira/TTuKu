import { RobotExportData } from "../types"
import { DIC } from "../kkutu"

export default class Robot {
  id: string
  robot: boolean = true
  game: {
    team?: number
    score?: number
    bonus?: number
    item?: any[]
    wpc?: any[]
  } = {} // GameData
  data: Record<string, any> = {}
  equip: Record<string, any> = { robot: true }

  // classic.js에서 사용함
  _done: any[] = []

  // jaqwi.ts에서 사용함
  _delay?: number
  _timer?: NodeJS.Timeout

  playAt: number
  ready: boolean

  constructor(
    public target: number | null,
    public place: number,
    public level: number
  ) {
    this.id = (
      target +
      place +
      Math.floor(Math.random() * 1000000000)
    ).toString()
    this.setLevel(level)
    this.setTeam(0)
  }

  getData(): RobotExportData {
    return {
      id: this.id,
      guest: false,
      robot: true,
      game: this.game,
      data: this.data,
      place: this.place,
      target: this.target,
      equip: this.equip,
      level: this.level,
      ready: true,
    }
  }

  setLevel(level: number) {
    this.level = level
    this.data.score = Math.pow(10, level + 2)
  }

  setTeam(team: number) {
    this.game.team = team
  }

  send() {}

  obtain() {}

  invokeWordPiece(_text: any, _coef: any) {}

  publish(type: string, data: any, _noBlock?: boolean) {
    if (this.target === null) {
      for (const i in DIC) {
        if (DIC[i].place == this.place) DIC[i].send(type, data)
      }
    } else if (DIC[this.target]) {
      DIC[this.target].send(type, data)
    }
  }

  chat(msg: string, _code: any) {
    this.publish("chat", { value: msg })
  }

  isRobot(): this is Robot {
    return true
  }
}
