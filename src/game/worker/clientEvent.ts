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
import { z } from "zod"

const eventHandlerData = new Map<
  string,
  {
    schema?: z.ZodSchema
    handler: (client: Client, data: unknown) => void
  }
>()

/*  yell Event */
const yellSchema = z.object({
  value: z.string(),
})

const onYell = (client: Client, { value }: z.infer<typeof yellSchema>) => {
  if (!value) return logger.warn("YELL: No value")
  if (!client.admin) return logger.warn("YELL: Not admin")

  client.publish("yell", { value })
}

eventHandlerData.set("yell", {
  schema: yellSchema,
  handler: onYell,
})

/* talk Event */
const chatSchema = z.object({
  value: z.string(),
  relay: z.boolean().default(false),
  whisper: z.string().optional(),
  data: z.any().optional(),
})

const onChat = (
  client: Client,
  { value, relay, whisper, data }: z.infer<typeof chatSchema>
) => {
  value = value.trim().substring(0, 200)
  if (!value) return logger.warn("TALK: No value")

  // 게스트 채팅 권한을 꺼 둔 경우
  if (client.guest && !GUEST_PERMISSION.talk)
    return client.send("error", { code: 401 })

  // 게임 내에서 단어를 잇는 채팅인 경우
  if (relay) {
    const gameRoom = client.subPlace
      ? client.pracRoom
      : workerRoomData[client.place]
    if (!gameRoom) return logger.warn("TALK: No place")
    if (!gameRoom.gaming) return logger.error("TALK(relay): Not gaming")

    // 이미 턴 제한시간이 지난 경우 일반 채팅으로 처리
    if (gameRoom.game.late) return client.chat(value)
    if (gameRoom.game.loading) return logger.warn("TALK(relay): Loading")

    return gameRoom.submit(client, value, data)
  }

  // 관리자가 '#'으로 시작하는 채팅을 입력한 경우
  if (client.admin && value.charAt(0) === "#")
    return process.send({ type: "admin", id: client.id, value: value })

  // 귓속말인 경우
  if (whisper) {
    process.send({
      type: "tail-report",
      id: client.id,
      chan: channelId,
      place: client.place,
      msg: data,
    })

    for (const v of whisper.split(",")) {
      const addresseeClient = workerClientData[DNAME[v]]
      if (!addresseeClient) return client.sendError(424, v)

      addresseeClient.send("chat", {
        from: client.profile.title || client.profile.name,
        profile: client.profile,
        value: data.value,
      })
    }
    return
  }

  // 일반 채팅 입력
  client.chat(value)
}

eventHandlerData.set("talk", {
  schema: chatSchema,
  handler: onChat,
})

/* refresh */
const onRefresh = async (client: Client) => client.refresh().then()
eventHandlerData.set("refresh", { handler: onRefresh })

export const onClientMessageOnSlave = async ($c: Client, msg) => {
  logger.debug(`Message from #${$c.id} (Slave):`, msg)
  if (!msg) return

  const eventHandler = eventHandlerData.get(msg.type)
  if (eventHandler) {
    if (eventHandler.schema) {
      const result = await eventHandler.schema.safeParseAsync(msg)
      // @ts-ignore
      if (!result.success) return logger.error(result.error)
      return eventHandler.handler($c, result.data)
    } else {
      return eventHandler.handler($c, msg)
    }
  } else logger.warn(`Use Legacy System: ${msg.type}`)

  let stable = true
  let temp

  switch (msg.type) {
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
