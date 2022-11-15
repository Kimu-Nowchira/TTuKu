export abstract class Auth {
  static config: {
    strategy: any
    color: string
    fontColor: string
    vendor: string
    displayName: string
  }

  static strategyConfig: {
    clientID: string
    clientSecret: string
    callbackURL: string
    passReqToCallback: true
    profileFields?: string[]
    scope: string[] | string
  }

  static authType: string

  static strategy = (process, MainDB) => {
    return (req, accessToken, refreshToken, profile, done) => {
      const $p = {
        authType: this.authType,
        id: this.authType + "-" + profile.id,
        name: profile.username,
        title: profile.username,
        image: profile._json.profile_image,
      }

      process(req, accessToken, MainDB, $p, done)
    }
  }
}
