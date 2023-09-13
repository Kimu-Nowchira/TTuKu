import { config } from "../config"
const request = require("request")

export const verifyRecaptcha = (
  responseToken: string,
  remoteIp: string,
  callback: (success: boolean) => void
) => {
  const verifyUrl = `https://google.com/recaptcha/api/siteverify?secret=${config.GOOGLE_RECAPTCHA_SECRET_KEY}&response=${responseToken}&remoteip=${remoteIp}`
  request(verifyUrl, (err: Error, _response: any, body: any) => {
    try {
      const responseBody = JSON.parse(body)
      callback(responseBody.success)
    } catch (e) {
      callback(false)
    }
  })
}
