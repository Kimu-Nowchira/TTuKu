import { GAME_TYPE } from "../../const"

// Client 내에서만 쓰이는 클래스
export default class Data {
  score: number
  playTime: number
  connectDate: number
  record: Record<string, any>

  constructor(data?: {
    score: number
    playTime: number
    connectDate: number
    record: Record<string, number[]>
  }) {
    if (!data)
      data = {
        score: 0,
        playTime: 0,
        connectDate: 0,
        record: {},
      }

    this.score = data.score || 0
    this.playTime = data.playTime || 0
    this.connectDate = data.connectDate || 0
    this.record = {}
    for (const i in GAME_TYPE) {
      const j = GAME_TYPE[i]
      this.record[j] = data.record
        ? data.record[GAME_TYPE[i]] || [0, 0, 0, 0]
        : [0, 0, 0, 0]
      if (!this.record[j][3]) this.record[j][3] = 0
    }
  }
  // 전, 승, 점수
}
