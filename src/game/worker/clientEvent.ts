import Client from "../classes/Client"
import { logger } from "../../sub/jjlog"
import {
  ENABLE_FORM,
  ENABLE_ROUND_TIME,
  GUEST_PERMISSION,
  MODE_LENGTH,
} from "../master"
import process from "node:process"
import { channelId, DNAME, workerClientData, workerRoomData } from "./index"

export const onClientMessageOnSlave = ($c: Client, msg) => {
  logger.debug(`Message from #${$c.id} (Slave):`, msg)
  let stable = true
  let temp

  if (!msg) return

  switch (msg.type) {
    case "yell":
      if (!msg.value) return
      if (!$c.admin) return

      $c.publish("yell", { value: msg.value })
      break
    case "refresh":
      $c.refresh()
      break
    case "talk":
      if (!msg.value) return
      if (typeof msg.value !== "string") return
      if (!GUEST_PERMISSION.talk)
        if ($c.guest) {
          $c.send("error", { code: 401 })
          return
        }
      msg.value = msg.value.substring(0, 200)
      if (msg.relay) {
        if ($c.subPlace) temp = $c.pracRoom
        else if (!(temp = workerRoomData[$c.place])) return
        if (!temp.gaming) return
        if (temp.game.late) {
          $c.chat(msg.value)
        } else if (!temp.game.loading) {
          temp.submit($c, msg.value, msg.data)
        }
      } else {
        if ($c.admin) {
          if (msg.value.charAt() == "#") {
            process.send({ type: "admin", id: $c.id, value: msg.value })
            break
          }
        }
        if (msg.whisper) {
          process.send({
            type: "tail-report",
            id: $c.id,
            chan: channelId,
            place: $c.place,
            msg: msg,
          })
          msg.whisper.split(",").forEach((v) => {
            if ((temp = workerClientData[DNAME[v]])) {
              temp.send("chat", {
                from: $c.profile.title || $c.profile.name,
                profile: $c.profile,
                value: msg.value,
              })
            } else {
              $c.sendError(424, v)
            }
          })
        } else {
          $c.chat(msg.value)
        }
      }
      break
    case "enter":
    case "setRoom":
      if (!msg.title) stable = false
      if (!msg.limit) stable = false
      if (!msg.round) stable = false
      if (!msg.time) stable = false
      if (!msg.opts) stable = false

      msg.code = false
      msg.limit = Number(msg.limit)
      msg.mode = Number(msg.mode)
      msg.round = Number(msg.round)
      msg.time = Number(msg.time)

      if (isNaN(msg.limit)) stable = false
      if (isNaN(msg.mode)) stable = false
      if (isNaN(msg.round)) stable = false
      if (isNaN(msg.time)) stable = false

      if (stable) {
        if (msg.title.length > 20) stable = false
        if (msg.password.length > 20) stable = false
        if (msg.limit < 2 || msg.limit > 8) {
          msg.code = 432
          stable = false
        }
        if (msg.mode < 0 || msg.mode >= MODE_LENGTH) stable = false
        if (msg.round < 1 || msg.round > 10) {
          msg.code = 433
          stable = false
        }
        if (ENABLE_ROUND_TIME.indexOf(msg.time) == -1) stable = false
      }
      if (msg.type == "enter") {
        if (msg.id || stable) $c.enter(msg, msg.spectate)
        else $c.sendError(msg.code || 431)
      } else if (msg.type == "setRoom") {
        if (stable) $c.setRoom(msg)
        else $c.sendError(msg.code || 431)
      }
      break
    case "leave":
      if (!$c.place) return

      $c.leave()
      break
    case "ready":
      if (!$c.place) return
      if (!GUEST_PERMISSION.ready) if ($c.guest) return

      $c.toggle()
      break
    case "start":
      if (!$c.place) return
      if (!workerRoomData[$c.place]) return
      if (workerRoomData[$c.place].gaming) return
      if (!GUEST_PERMISSION.start) if ($c.guest) return

      $c.start()
      break
    case "practice":
      if (!workerRoomData[$c.place]) return
      if (workerRoomData[$c.place].gaming) return
      if (!GUEST_PERMISSION.practice) if ($c.guest) return
      if (isNaN((msg.level = Number(msg.level)))) return
      if (workerRoomData[$c.place].rule.ai) {
        if (msg.level < 0 || msg.level >= 5) return
      } else if (msg.level != -1) return

      $c.practice(msg.level)
      break
    case "invite":
      if (!workerRoomData[$c.place]) return
      if (workerRoomData[$c.place].gaming) return
      if (workerRoomData[$c.place].master != $c.id) return
      if (!GUEST_PERMISSION.invite) if ($c.guest) return
      if (msg.target == "AI") {
        workerRoomData[$c.place].addAI($c)
      } else {
        process.send({
          type: "invite",
          id: $c.id,
          place: $c.place,
          target: msg.target,
        })
      }
      break
    case "inviteRes":
      if (!(temp = workerRoomData[msg.from])) return
      if (!GUEST_PERMISSION.inviteRes) if ($c.guest) return
      if (msg.res) {
        $c.enter({ id: msg.from }, false, true)
      } else {
        if (workerClientData[temp.master])
          workerClientData[temp.master].send("inviteNo", { target: $c.id })
      }
      break
    case "form":
      if (!msg.mode) return
      if (!workerRoomData[$c.place]) return
      if (ENABLE_FORM.indexOf(msg.mode) == -1) return

      $c.setForm(msg.mode)
      break
    case "team":
      if (!workerRoomData[$c.place]) return
      if (workerRoomData[$c.place].gaming) return
      if ($c.ready) return
      if (isNaN((temp = Number(msg.value)))) return
      if (temp < 0 || temp > 4) return

      $c.setTeam(Math.round(temp))
      break
    case "kick":
      if (!msg.robot) if (!(temp = workerClientData[msg.target])) return
      if (!workerRoomData[$c.place]) return
      if (workerRoomData[$c.place].gaming) return
      if (!msg.robot) if ($c.place != temp.place) return
      if (workerRoomData[$c.place].master != $c.id) return
      if (workerRoomData[$c.place].kickVote) return
      if (!GUEST_PERMISSION.kick) if ($c.guest) return

      if (msg.robot) $c.kick(null, msg.target)
      else $c.kick(msg.target)
      break
    case "kickVote":
      if (!(temp = workerRoomData[$c.place])) return
      if (!temp.kickVote) return
      if ($c.id == temp.kickVote.target) return
      if ($c.id == temp.master) return
      if (temp.kickVote.list.indexOf($c.id) != -1) return
      if (!GUEST_PERMISSION.kickVote) if ($c.guest) return

      $c.kickVote($c, msg.agree)
      break
    case "handover":
      if (!workerClientData[msg.target]) return
      if (!(temp = workerRoomData[$c.place])) return
      if (temp.gaming) return
      if ($c.place != workerClientData[msg.target].place) return
      if (temp.master != $c.id) return

      temp.master = msg.target
      temp.export()
      break
    case "wp":
      if (!msg.value) return
      if (!GUEST_PERMISSION.wp)
        if ($c.guest) {
          $c.send("error", { code: 401 })
          return
        }

      msg.value = msg.value.substring(0, 200)
      msg.value = msg.value.replace(/[^a-z가-힣]/g, "")
      if (msg.value.length < 2) return
      break
    case "setAI":
      if (!msg.target) return
      if (!workerRoomData[$c.place]) return
      if (workerRoomData[$c.place].gaming) return
      if (workerRoomData[$c.place].master != $c.id) return
      if (isNaN((msg.level = Number(msg.level)))) return
      if (msg.level < 0 || msg.level >= 5) return
      if (isNaN((msg.team = Number(msg.team)))) return
      if (msg.team < 0 || msg.team > 4) return

      workerRoomData[$c.place].setAI(
        msg.target,
        Math.round(msg.level),
        Math.round(msg.team)
      )
      break
    default:
      break
  }
}
