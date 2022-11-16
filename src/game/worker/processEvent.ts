import process from "node:process"
import { appendFile } from "fs"
import { logger } from "../../sub/jjlog"
import { roomDataSchema } from "../types"
import { z } from "zod"
import {
  channelId,
  reservedRoomCache,
  workerClientData,
  workerRoomData,
} from "./index"

const eventHandlerData = new Map<
  string,
  {
    schema: z.ZodSchema
    handler: (data: any) => void
  }
>()

/*  Uncaught Exception */
const onUncaughtException = (err: Error) => {
  const text = `:${
    process.env["KKUTU_PORT"]
  } [${new Date().toLocaleString()}] ERROR: ${err.toString()}\n${err.stack}`

  for (const i in workerClientData) workerClientData[i].send("dying")

  appendFile("../KKUTU_ERROR.log", text, () => {
    logger.error(`ERROR OCCURRED! This worker will die in 10 seconds.`)
    logger.error(text)
  })

  setTimeout(() => {
    process.exit()
  }, 10000)
}

/*  invite-error Event */
const inviteErrorSchema = z.object({
  target: z.string(),
  code: z.number(),
})

const onInviteError = async (data: z.infer<typeof inviteErrorSchema>) => {
  if (!workerClientData[data.target]) return
  workerClientData[data.target].sendError(data.code)
}

eventHandlerData.set("invite-error", {
  schema: inviteErrorSchema,
  handler: onInviteError,
})

/*  room-reserve Event */
const roomReserveSchema = z.object({
  session: z.string(),
  create: z.boolean(),
  room: roomDataSchema,
  profile: z.string().optional(),
  spec: z.string().optional(),
  pass: z.boolean().optional(),
})

const onRoomReserve = async (data: z.infer<typeof roomReserveSchema>) => {
  if (reservedRoomCache[data.session])
    return logger.error(
      `Already reserved from ${data.session} on @${channelId}`
    )

  reservedRoomCache[data.session] = {
    profile: data.profile,
    room: data.room,
    spec: data.spec,
    pass: data.pass,
    _expiration: setTimeout(
      (tg: string, create: boolean) => {
        process.send({
          type: "room-expired",
          id: data.room.id,
          create: create,
        })
        delete reservedRoomCache[tg]
      },
      10000,
      data.session,
      data.create
    ),
  }
}

/*  room-invalid Event */
const roomInvalidSchema = z.object({
  room: z.object({ id: z.string() }),
})

const onRoomInvalid = (data: z.infer<typeof roomInvalidSchema>) => {
  delete workerRoomData[data.room.id]
}

eventHandlerData.set("room-invalid", {
  schema: roomInvalidSchema,
  handler: onRoomInvalid,
})

process.on("message", async (msg: { type: string }) => {
  eventHandlerData.set("room-reserve", {
    schema: roomReserveSchema,
    handler: onRoomReserve,
  })

  const eventHandler = eventHandlerData.get(msg.type)
  if (!eventHandler)
    return logger.warn(`Unhandled IPC message type: ${msg.type}`)

  const result = await eventHandler.schema.safeParseAsync(msg)
  // @ts-ignore
  if (!result.success) return logger.error(result.error)

  eventHandler.handler(result.data)
})

process.on("uncaughtException", onUncaughtException)
