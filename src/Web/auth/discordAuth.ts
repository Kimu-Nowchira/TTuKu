import { auth } from "../../config"

import { Strategy } from "passport-discord"

export class DiscordAuth {
  static config = {
    strategy: Strategy,
    color: "#7289DA",
    fontColor: "#FFFFFF",
    vendor: "discord",
    displayName: "withDiscord",
  }

  static strategyConfig = {
    clientID: auth.discord.clientID,
    clientSecret: auth.discord.clientSecret,
    callbackURL: auth.discord.callbackURL,
    passReqToCallback: true as true,
    scope: "identify",
  }

  static authType = "discord"

  static strategy(process) {
    return (req, accessToken, refreshToken, profile, done) => {
      const $p = {
        authType: DiscordAuth.authType,
        id: DiscordAuth.authType + "-" + profile.id,
        name: profile.username,
        title: profile.username,
        image: `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`,
      }

      process(req, accessToken, $p, done)
    }
  }
}
