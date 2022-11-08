/**
 * Rule the words! KKuTu Online
 * Copyright (C) 2017 JJoriping(op@jjo.kr)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { Game } from "."
import {
  ENG_ID,
  EXAMPLE_TITLE,
  GAME_TYPE,
  getPenalty,
  getPreScore,
  KOR_FLAG,
  KOR_GROUP,
  KOR_STRICT,
  MISSION_en,
  MISSION_ko,
} from "../../const"
import { all, Tail } from "../../sub/lizard"
import { Client, Robot } from "../kkutu"

const ROBOT_START_DELAY = [1200, 800, 400, 200, 0]
const ROBOT_TYPE_COEF = [1250, 750, 500, 250, 0]
const ROBOT_THINK_COEF = [4, 2, 1, 0, 0]
const ROBOT_HIT_LIMIT = [8, 4, 2, 1, 0]
const ROBOT_LENGTH_LIMIT = [3, 4, 9, 99, 99]
const RIEUL_TO_NIEUN = [4449, 4450, 4457, 4460, 4462, 4467]
const RIEUL_TO_IEUNG = [4451, 4455, 4456, 4461, 4466, 4469]
const NIEUN_TO_IEUNG = [4455, 4461, 4466, 4469]

class Classic extends Game {
  getTitle() {
    const R = new Tail()
    var l = this.room.rule
    var EXAMPLE
    var eng, ja

    if (!l) {
      R.go("undefinedd")
      return R
    }
    if (!l.lang) {
      R.go("undefinedd")
      return R
    }
    EXAMPLE = EXAMPLE_TITLE[l.lang]
    this.room.game.dic = {}

    switch (GAME_TYPE[this.room.mode]) {
      case "EKT":
      case "ESH":
        eng = "^" + String.fromCharCode(97 + Math.floor(Math.random() * 26))
        break
      case "KKT":
        this.room.game.wordLength = 3
      // fall-through
      case "KSH":
        ja = 44032 + 588 * Math.floor(Math.random() * 18)
        eng = "^[\\u" + ja.toString(16) + "-\\u" + (ja + 587).toString(16) + "]"
        break
      case "KAP":
        ja = 44032 + 588 * Math.floor(Math.random() * 18)
        eng = "[\\u" + ja.toString(16) + "-\\u" + (ja + 587).toString(16) + "]$"
        break
    }

    const checkTitle = (title: null | string) => {
      var R = new Tail()
      var i,
        list = []
      var len

      if (title == null) {
        R.go(EXAMPLE)
      } else {
        len = title.length
        for (i = 0; i < len; i++)
          list.push(
            getAuto.call(
              this.room,
              title[i],
              getSubChar.call(this.room, title[i]),
              1
            )
          )

        all(list).then((res) => {
          for (i in res) if (!res[i]) return R.go(EXAMPLE)

          return R.go(title)
        })
      }
      return R
    }

    const tryTitle = (h) => {
      if (h > 50) {
        R.go(EXAMPLE)
        return
      }
      this.DB.kkutu[l.lang]
        .find(
          [
            "_id",
            new RegExp(eng + ".{" + Math.max(1, this.room.round - 1) + "}$"),
          ],
          // [ 'hit', { '$lte': h } ],
          l.lang == "ko" ? ["type", KOR_GROUP] : ["_id", ENG_ID]
          // '$where', eng+"this._id.length == " + Math.max(2, this.room.round) + " && this.hit <= " + h
        )
        .limit(20)
        .on(function ($md) {
          var list

          if ($md.length) {
            list = shuffle($md)
            checkTitle(list.shift()._id).then(onChecked)

            function onChecked(v) {
              if (v) R.go(v)
              else if (list.length) checkTitle(list.shift()._id).then(onChecked)
              else R.go(EXAMPLE)
            }
          } else {
            tryTitle(h + 10)
          }
        })
    }

    tryTitle(10)
    return R
  }

  async roundReady() {
    if (!this.room.game.title) return

    clearTimeout(this.room.game.turnTimer)
    this.room.game.round++
    this.room.game.roundTime = this.room.time * 1000
    if (this.room.game.round <= this.room.round) {
      this.room.game.char = this.room.game.title[this.room.game.round - 1]
      this.room.game.subChar = getSubChar.call(this.room, this.room.game.char)
      this.room.game.chain = []
      if (this.room.opts.mission)
        this.room.game.mission = getMission(this.room.rule.lang)
      if (this.room.opts.sami) this.room.game.wordLength = 2

      this.room.byMaster(
        "roundReady",
        {
          round: this.room.game.round,
          char: this.room.game.char,
          subChar: this.room.game.subChar,
          mission: this.room.game.mission,
        },
        true
      )

      await new Promise(
        (resolve) => (this.room.game.turnTimer = setTimeout(resolve, 2400))
      )
      this.room.turnStart()
    } else {
      this.room.roundEnd()
    }
  }

  async turnStart(force) {
    var speed
    var si

    if (!this.room.game.chain) return
    this.room.game.roundTime = Math.min(
      this.room.game.roundTime,
      Math.max(10000, 150000 - this.room.game.chain.length * 1500)
    )
    speed = this.room.getTurnSpeed(this.room.game.roundTime)
    clearTimeout(this.room.game.turnTimer)
    clearTimeout(this.room.game.robotTimer)
    this.room.game.late = false
    this.room.game.turnTime = 15000 - 1400 * speed
    this.room.game.turnAt = new Date().getTime()
    if (this.room.opts.sami)
      this.room.game.wordLength = this.room.game.wordLength == 3 ? 2 : 3

    this.room.byMaster(
      "turnStart",
      {
        turn: this.room.game.turn,
        char: this.room.game.char,
        subChar: this.room.game.subChar,
        speed: speed,
        roundTime: this.room.game.roundTime,
        turnTime: this.room.game.turnTime,
        mission: this.room.game.mission,
        wordLength: this.room.game.wordLength,
        seq: force ? this.room.game.seq : undefined,
      },
      true
    )
    if ((si = this.room.game.seq[this.room.game.turn]))
      if (si.robot) {
        si._done = []
        this.room.readyRobot(si)
      }

    await new Promise(
      (resolve) =>
        (this.room.game.turnTimer = setTimeout(
          resolve,
          Math.min(this.room.game.roundTime, this.room.game.turnTime + 100)
        ))
    )
    this.room.turnEnd()
  }

  async turnEnd() {
    var target
    var score

    if (!this.room.game.seq) return
    target =
      this.DIC[this.room.game.seq[this.room.game.turn]] ||
      this.room.game.seq[this.room.game.turn]

    if (this.room.game.loading) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      this.room.turnEnd()
      return
    }

    this.room.game.late = true
    if (target)
      if (target.game) {
        score = getPenalty(this.room.game.chain, target.game.score)
        target.game.score += score
      }
    getAuto
      .call(this.room, this.room.game.char, this.room.game.subChar, 0)
      .then((w) => {
        this.room.byMaster(
          "turnEnd",
          {
            ok: false,
            target: target ? target.id : null,
            score: score,
            hint: w,
          },
          true
        )

        // TODO: 임시
        const roundReadyAfter3Sec = async () => {
          await new Promise(
            (resolve) => (this.room.game._rrt = setTimeout(resolve, 3000))
          )
          this.room.roundReady()
        }

        roundReadyAfter3Sec().then()
      })
    clearTimeout(this.room.game.robotTimer)
  }

  async submit(client: Client, text: string) {
    var score, l, t
    const tv = new Date().getTime()
    var mgt = this.room.game.seq[this.room.game.turn]

    if (!mgt) return
    if (!mgt.robot) if (mgt != client.id) return
    if (!this.room.game.char) return

    const isChainable = () => {
      var type = GAME_TYPE[this.room.mode]
      var char = this.room.game.char,
        subChar = this.room.game.subChar
      var l = char.length

      if (!text) return false
      if (text.length <= l) return false
      if (this.room.game.wordLength && text.length != this.room.game.wordLength)
        return false
      if (type == "KAP")
        return text.slice(-1) == char || text.slice(-1) == subChar
      switch (l) {
        case 1:
          return text[0] == char || text[0] == subChar
        case 2:
          return text.substr(0, 2) == char
        case 3:
          return text.substr(0, 3) == char || text.substr(0, 2) == char.slice(1)
        default:
          return false
      }
    }

    if (!isChainable())
      // text, this.room.mode, this.room.game.char, this.room.game.subChar
      return client.chat(text)
    if (this.room.game.chain.indexOf(text) != -1)
      return client.publish("turnError", { code: 409, value: text }, true)

    l = this.room.rule.lang
    this.room.game.loading = true

    const onDB = async ($doc) => {
      if (!this.room.game.chain) return
      var preChar = getChar.call(this.room, text)
      var preSubChar = getSubChar.call(this.room, preChar)
      var firstMove = this.room.game.chain.length < 1

      const preApproved = async () => {
        const approved = async () => {
          if (this.room.game.late) return
          if (!this.room.game.chain) return
          if (!this.room.game.dic) return

          this.room.game.loading = false
          this.room.game.late = true
          clearTimeout(this.room.game.turnTimer)
          t = tv - this.room.game.turnAt
          score = this.room.getScore(text, t)
          this.room.game.dic[text] = (this.room.game.dic[text] || 0) + 1
          this.room.game.chain.push(text)
          this.room.game.roundTime -= t
          this.room.game.char = preChar
          this.room.game.subChar = preSubChar
          client.game.score += score
          client.publish(
            "turnEnd",
            {
              ok: true,
              value: text,
              mean: $doc.mean,
              theme: $doc.theme,
              wc: $doc.type,
              score: score,
              bonus:
                this.room.game.mission === true
                  ? score - this.room.getScore(text, t, true)
                  : 0,
              baby: $doc.baby,
            },
            true
          )
          if (this.room.game.mission === true) {
            this.room.game.mission = getMission(this.room.rule.lang)
          }

          if (!client.robot) {
            client.invokeWordPiece(text, 1)
            DB.kkutu[l]
              .update(["_id", text])
              .set(["hit", $doc.hit + 1])
              .on()
          }

          await new Promise((res) =>
            setTimeout(res, this.room.game.turnTime / 6)
          )
          this.room.turnNext()
        }
        if (firstMove || this.room.opts.manner)
          getAuto.call(this.room, preChar, preSubChar, 1).then((w) => {
            if (w) approved()
            else {
              this.room.game.loading = false
              client.publish(
                "turnError",
                { code: firstMove ? 402 : 403, value: text },
                true
              )
              if (client.robot) {
                // TODO: 임시
                this.room.readyRobot(client as unknown as Robot)
              }
            }
          })
        else approved()
      }

      const denied = (code = 404) => {
        this.room.game.loading = false
        client.publish("turnError", { code: code, value: text }, true)
      }

      if ($doc) {
        if (!this.room.opts.injeong && $doc.flag & KOR_FLAG.INJEONG) denied()
        else if (
          this.room.opts.strict &&
          (!$doc.type.match(KOR_STRICT) || $doc.flag >= 4)
        )
          denied(406)
        else if (this.room.opts.loanword && $doc.flag & KOR_FLAG.LOANWORD)
          denied(405)
        else preApproved()
      } else {
        denied()
      }
    }

    DB.kkutu[l]
      .findOne(["_id", text], l == "ko" ? ["type", KOR_GROUP] : ["_id", ENG_ID])
      .on(onDB)
  }

  getScore(text: string, delay: number, ignoreMission: boolean) {
    var tr = 1 - delay / this.room.game.turnTime
    var score, arr

    if (!text || !this.room.game.chain || !this.room.game.dic) return 0
    score = getPreScore(text, this.room.game.chain, tr)

    if (this.room.game.dic[text]) score *= 15 / (this.room.game.dic[text] + 15)
    if (!ignoreMission)
      if ((arr = text.match(new RegExp(this.room.game.mission, "g")))) {
        score += score * 0.5 * arr.length
        this.room.game.mission = true
      }
    return Math.round(score)
  }

  async readyRobot(robot) {
    var level = robot.level
    var delay = ROBOT_START_DELAY[level]
    var ended = {}
    var w, text, i
    var lmax
    var isRev = GAME_TYPE[this.room.mode] == "KAP"

    getAuto
      .call(this.room, this.room.game.char, this.room.game.subChar, 2)
      .then((list) => {
        if (list.length) {
          list.sort(function (a, b) {
            return b.hit - a.hit
          })
          if (ROBOT_HIT_LIMIT[level] > list[0].hit) denied()
          else {
            if (level >= 3 && !robot._done.length) {
              if (Math.random() < 0.5)
                list.sort(function (a, b) {
                  return b._id.length - a._id.length
                })
              if (list[0]._id.length < 8 && this.room.game.turnTime >= 2300) {
                for (i in list) {
                  w = list[i]._id.charAt(isRev ? 0 : list[i]._id.length - 1)
                  if (!ended.hasOwnProperty(w)) ended[w] = []
                  ended[w].push(list[i])
                }
                getWishList(Object.keys(ended)).then(function (key) {
                  var v = ended[key]

                  if (!v) denied()
                  else pickList(v)
                })
              } else {
                pickList(list)
              }
            } else pickList(list)
          }
        } else denied()
      })

    const denied = () => {
      text = isRev
        ? `T.T ...${this.room.game.char}`
        : `${this.room.game.char}... T.T`
      after()
    }

    const pickList = (list) => {
      if (list)
        do {
          if (!(w = list.shift())) break
        } while (
          w._id.length > ROBOT_LENGTH_LIMIT[level] ||
          robot._done.includes(w._id)
        )
      if (w) {
        text = w._id
        delay +=
          (500 * ROBOT_THINK_COEF[level] * Math.random()) /
          Math.log(1.1 + w.hit)
        after()
      } else denied()
    }

    const after = async () => {
      delay += text.length * ROBOT_TYPE_COEF[level]
      robot._done.push(text)

      await new Promise((res) => setTimeout(res, delay))
      this.room.turnRobot(robot, text)
    }

    const getWishList = (list) => {
      var R = new Tail()
      var wz = []
      var res

      for (i in list) wz.push(getWish(list[i]))

      all(wz).then(($res) => {
        if (!this.room.game.chain) return
        $res.sort((a, b) => {
          return a.length - b.length
        })

        if (this.room.opts.manner || !this.room.game.chain.length) {
          while ((res = $res.shift())) if (res.length) break
        } else res = $res.shift()
        R.go(res ? res.char : null)
      })
      return R
    }

    const getWish = (char: string) => {
      var R = new Tail()

      this.DB.kkutu[this.room.rule.lang]
        .find(["_id", new RegExp(isRev ? `.${char}$` : `^${char}.`)])
        .limit(10)
        .on(function ($res) {
          R.go({ char: char, length: $res.length })
        })
      return R
    }
  }
}

function getMission(l) {
  var arr = l == "ko" ? MISSION_ko : MISSION_en

  if (!arr) return "-"
  return arr[Math.floor(Math.random() * arr.length)]
}

function getAuto(char, subc, type) {
  /* type
		0 ������ �ܾ� �ϳ�
		1 ���� ����
		2 �ܾ� ���
	*/
  var my = this
  var R = new Tail()
  var gameType = GAME_TYPE[my.mode]
  var adv, adc
  var key = gameType + "_" + keyByOptions(my.opts)
  var MAN = this.DB.kkutu_manner[my.rule.lang]
  var bool = type == 1

  adc = char + (subc ? "|" + subc : "")
  switch (gameType) {
    case "EKT":
      adv = `^(${adc})..`
      break
    case "KSH":
      adv = `^(${adc}).`
      break
    case "ESH":
      adv = `^(${adc})...`
      break
    case "KKT":
      adv = `^(${adc}).{${my.game.wordLength - 1}}$`
      break
    case "KAP":
      adv = `.(${adc})$`
      break
  }
  if (!char) {
    console.log(`Undefined char detected! key=${key} type=${type} adc=${adc}`)
  }
  MAN.findOne(["_id", char || "��"]).on(function ($mn) {
    if ($mn && bool) {
      if ($mn[key] === null) produce()
      else R.go($mn[key])
    } else {
      produce()
    }
  })
  function produce() {
    var aqs = [["_id", new RegExp(adv)]] as [string, any][]
    var aft
    var lst

    if (!my.opts.injeong) aqs.push(["flag", { $nand: KOR_FLAG.INJEONG }])
    if (my.rule.lang == "ko") {
      if (my.opts.loanword) aqs.push(["flag", { $nand: KOR_FLAG.LOANWORD }])
      if (my.opts.strict) aqs.push(["type", KOR_STRICT], ["flag", { $lte: 3 }])
      else aqs.push(["type", KOR_GROUP])
    } else {
      aqs.push(["_id", ENG_ID])
    }
    switch (type) {
      case 0:
      default:
        aft = function ($md) {
          R.go($md[Math.floor(Math.random() * $md.length)])
        }
        break
      case 1:
        aft = function ($md) {
          R.go($md.length ? true : false)
        }
        break
      case 2:
        aft = function ($md) {
          R.go($md)
        }
        break
    }
    DB.kkutu[my.rule.lang].find
      .apply(this, aqs)
      .limit(bool ? 1 : 123)
      .on(function ($md) {
        forManner($md)
        if (my.game.chain)
          aft(
            $md.filter(function (item) {
              return !my.game.chain.includes(item)
            })
          )
        else aft($md)
      })
    function forManner(list) {
      lst = list
      MAN.upsert(["_id", char])
        .set([key, lst.length ? true : false])
        .on(null, null, onFail)
    }
    function onFail() {
      MAN.createColumn(key, "boolean").on(function () {
        forManner(lst)
      })
    }
  }
  return R
}

function keyByOptions(opts) {
  var arr = []

  if (opts.injeong) arr.push("X")
  if (opts.loanword) arr.push("L")
  if (opts.strict) arr.push("S")
  return arr.join("")
}

function shuffle(arr) {
  var i,
    r = []

  for (i in arr) r.push(arr[i])
  r.sort(function (a, b) {
    return Math.random() - 0.5
  })

  return r
}

function getChar(text) {
  var my = this

  switch (GAME_TYPE[my.mode]) {
    case "EKT":
      return text.slice(text.length - 3)
    case "ESH":
    case "KKT":
    case "KSH":
      return text.slice(-1)
    case "KAP":
      return text.charAt(0)
  }
}

function getSubChar(char) {
  var my = this
  var r
  var c = char.charCodeAt()
  var k
  var ca, cb, cc

  switch (GAME_TYPE[my.mode]) {
    case "EKT":
      if (char.length > 2) r = char.slice(1)
      break
    case "KKT":
    case "KSH":
    case "KAP":
      k = c - 0xac00
      if (k < 0 || k > 11171) break
      ca = [Math.floor(k / 28 / 21), Math.floor(k / 28) % 21, k % 28]
      cb = [ca[0] + 0x1100, ca[1] + 0x1161, ca[2] + 0x11a7]
      cc = false
      if (cb[0] == 4357) {
        // ������ ��, ��
        cc = true
        if (RIEUL_TO_NIEUN.includes(cb[1])) cb[0] = 4354
        else if (RIEUL_TO_IEUNG.includes(cb[1])) cb[0] = 4363
        else cc = false
      } else if (cb[0] == 4354) {
        // ������ ��
        if (NIEUN_TO_IEUNG.indexOf(cb[1]) != -1) {
          cb[0] = 4363
          cc = true
        }
      }
      if (cc) {
        cb[0] -= 0x1100
        cb[1] -= 0x1161
        cb[2] -= 0x11a7
        r = String.fromCharCode((cb[0] * 21 + cb[1]) * 28 + cb[2] + 0xac00)
      }
      break
    case "ESH":
    default:
      break
  }
  return r
}

export default Classic
