import WebSocket from "ws"

import { logger } from "../../sub/jjlog"
import { DIC, narrate } from "../kkutu"

export default class WebServer {
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
