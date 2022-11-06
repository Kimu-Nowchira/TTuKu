export const config = require("./sub/global.json") as IConfig
export const auth = require("./sub/auth.json") as IAuthConfig

interface IConfig {
  ADMIN: string[]
  MAIN_PORTS: number[]
  GAME_SERVER_HOST: string
  KKUTUHOT_PATH: string
  PASS: string
  PG_HOST: string
  PG_USER: string
  PG_PASSWORD: string
  PG_PORT: number
  PG_DATABASE: string
  GOOGLE_RECAPTCHA_TO_GUEST: boolean
  GOOGLE_RECAPTCHA_TO_USER: boolean
  GOOGLE_RECAPTCHA_SITE_KEY: string
  GOOGLE_RECAPTCHA_SECRET_KEY: string
  IS_SECURED: boolean
  SSL_OPTIONS: {
    PRIVKEY: string
    CERT: string
    CA: string
    PFX: string
    isPFX: boolean
    isCA: boolean
  }
  USER_BLOCK_OPTIONS: {
    USE_MODULE: boolean
    USE_X_FORWARDED_FOR: boolean
    BLOCK_IP_ONLY_FOR_GUEST: boolean
    DEFAULT_BLOCKED_TEXT: string
    BLOCKED_FOREVER: string
  }
  SEASON?: string
  SEASON_PRE?: string
}

interface IAuthConfig {
  daldalso: OAuthConfig
  naver: OAuthConfig
  facebook: OAuthConfig
  google: OAuthConfig
  twitter: OAuthConfig
  kakao: OAuthConfig
  discord: OAuthConfig
  twitch: OAuthConfig
  github: OAuthConfig
  line: OAuthConfig
  instagram: OAuthConfig
  spotify: OAuthConfig
}

interface OAuthConfig {
  clientID: string
  clientSecret: string
  callbackURL: string
}
