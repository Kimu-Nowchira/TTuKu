import { PlayerExportData } from "../types"
import Data from "./Data"

export abstract class Player {
  id: string
  robot = false
  guest = false
  game: Record<string, any> = {}

  place = 0
  data: Data
  equip: Record<string, any>

  getData(): PlayerExportData {
    return {
      id: this.id,
      guest: this.guest,
      robot: this.robot,
      game: this.game,
      data: this.data,
      place: this.place,
      equip: this.equip,
    }
  }
}
