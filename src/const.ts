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

const GLOBAL = require("./sub/global.json")

export const KKUTU_MAX = 400
export const MAIN_PORTS = GLOBAL.MAIN_PORTS
export const TEST_PORT = 4040
export const SPAM_CLEAR_DELAY = 1600
export const SPAM_ADD_DELAY = 750
export const SPAM_LIMIT = 7
export const BLOCKED_LENGTH = 10000
export const KICK_BY_SPAM = 9
export const MAX_OBSERVER = 4
export const TESTER = GLOBAL.ADMIN.concat(["Input tester id here"])
export const IS_SECURED = GLOBAL.IS_SECURED
export const SSL_OPTIONS = GLOBAL.SSL_OPTIONS
export const OPTIONS = {
  man: { name: "Manner" },
  ext: { name: "Injeong" },
  mis: { name: "Mission" },
  loa: { name: "Loanword" },
  prv: { name: "Proverb" },
  str: { name: "Strict" },
  k32: { name: "Sami" },
  no2: { name: "No2" },
}
export const MOREMI_PART = [
  "back",
  "eye",
  "mouth",
  "shoes",
  "clothes",
  "head",
  "lhand",
  "rhand",
  "front",
]
export const CATEGORIES = [
  "all",
  "spec",
  "skin",
  "badge",
  "head",
  "eye",
  "mouth",
  "clothes",
  "hs",
  "back",
]
export const AVAIL_EQUIP = [
  "NIK",
  "BDG1",
  "BDG2",
  "BDG3",
  "BDG4",
  "Mhead",
  "Meye",
  "Mmouth",
  "Mhand",
  "Mclothes",
  "Mshoes",
  "Mback",
]
export const GROUPS = {
  spec: ["PIX", "PIY", "PIZ", "CNS"],
  skin: ["NIK"],
  badge: ["BDG1", "BDG2", "BDG3", "BDG4"],
  head: ["Mhead"],
  eye: ["Meye"],
  mouth: ["Mmouth"],
  clothes: ["Mclothes"],
  hs: ["Mhand", "Mshoes"],
  back: ["Mback", "Mfront"],
}
export const RULE = {
  /*
	유형: { lang: 언어,
		rule: 이름,
		opts: [ 추가 규칙 ],
		time: 시간 상수,
		ai: AI 가능?,
		big: 큰 화면?,
		ewq: 현재 턴 나가면 라운드 종료?
	}
*/
  EKT: {
    lang: "en",
    rule: "Classic",
    opts: ["man", "ext", "mis"],
    time: 1,
    ai: true,
    big: false,
    ewq: true,
  },
  ESH: {
    lang: "en",
    rule: "Classic",
    opts: ["ext", "mis"],
    time: 1,
    ai: true,
    big: false,
    ewq: true,
  },
  KKT: {
    lang: "ko",
    rule: "Classic",
    opts: ["man", "ext", "mis", "loa", "str", "k32"],
    time: 1,
    ai: true,
    big: false,
    ewq: true,
  },
  KSH: {
    lang: "ko",
    rule: "Classic",
    opts: ["man", "ext", "mis", "loa", "str"],
    time: 1,
    ai: true,
    big: false,
    ewq: true,
  },
  CSQ: {
    lang: "ko",
    rule: "Jaqwi",
    opts: ["ijp"],
    time: 1,
    ai: true,
    big: false,
    ewq: false,
  },
  KCW: {
    lang: "ko",
    rule: "Crossword",
    opts: [],
    time: 2,
    ai: false,
    big: true,
    ewq: false,
  },
  KTY: {
    lang: "ko",
    rule: "Typing",
    opts: ["prv"],
    time: 1,
    ai: false,
    big: false,
    ewq: false,
  },
  ETY: {
    lang: "en",
    rule: "Typing",
    opts: ["prv"],
    time: 1,
    ai: false,
    big: false,
    ewq: false,
  },
  KAP: {
    lang: "ko",
    rule: "Classic",
    opts: ["man", "ext", "mis", "loa", "str"],
    time: 1,
    ai: true,
    big: false,
    _back: true,
    ewq: true,
  },
  HUN: {
    lang: "ko",
    rule: "Hunmin",
    opts: ["ext", "mis", "loa", "str"],
    time: 1,
    ai: true,
    big: false,
    ewq: true,
  },
  KDA: {
    lang: "ko",
    rule: "Daneo",
    opts: ["ijp", "mis"],
    time: 1,
    ai: true,
    big: false,
    ewq: true,
  },
  EDA: {
    lang: "en",
    rule: "Daneo",
    opts: ["ijp", "mis"],
    time: 1,
    ai: true,
    big: false,
    ewq: true,
  },
  KSS: {
    lang: "ko",
    rule: "Sock",
    opts: ["no2"],
    time: 1,
    ai: false,
    big: true,
    ewq: false,
  },
  ESS: {
    lang: "en",
    rule: "Sock",
    opts: ["no2"],
    time: 1,
    ai: false,
    big: true,
    ewq: false,
  },
}
export const getPreScore = function (text: string, chain: any[], tr: number) {
  return (
    2 *
    (Math.pow(5 + 7 * (text || "").length, 0.74) +
      0.88 * (chain || []).length) *
    (0.5 + 0.5 * tr)
  )
}
export const getPenalty = function (chain: any[], score: number) {
  return (
    -1 *
    Math.round(Math.min(10 + (chain || []).length * 2.1 + score * 0.15, score))
  )
}
export const GAME_TYPE = Object.keys(RULE)
export const EXAMPLE_TITLE = {
  ko: "가나다라마바사아자차",
  en: "abcdefghij",
}
export const INIT_SOUNDS = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
]
export const MISSION_ko = [
  "가",
  "나",
  "다",
  "라",
  "마",
  "바",
  "사",
  "아",
  "자",
  "차",
  "카",
  "타",
  "파",
  "하",
]
export const MISSION_en = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
]

export const KO_INJEONG = [
  "computer",
  "fiction",
  "person",
  "game",
  "ani",
  "comic",
  "tv",
  "book",
  "food",
  "traffic",
  "movie",
  "corp",
]
export const EN_INJEONG = ["LOL"]
export const KO_THEME = [
  "가톨릭",
  "건설",
  "경영",
  "경제",
  "고유명 일반",
  "공업",
  "공예",
  "공학 일반",
  "광업",
  "교육",
  "교통",
  "군사",
  "기계",
  "기독교",
  "농업",
  "동물",
  "매체",
  "무용",
  "문학",
  "물리",
  "미술",
  "민속",
  "법률",
  "보건 일반",
  "복식",
  "복지",
  "불교",
  "사회 일반",
  "산업 일반",
  "생명",
  "서비스업",
  "수산업",
  "수의",
  "수학",
  "식물",
  "식품",
  "심리",
  "약학",
  "언어",
  "역사",
  "연기",
  "영상",
  "예체능 일반",
  "음악",
  "의학",
  "인명",
  "인문 일반",
  "임업",
  "자연 일반",
  "재료",
  "전기·전자",
  "정보·통신",
  "정치",
  "종교 일반",
  "지구",
  "지리",
  "지명",
  "책명",
  "천문",
  "천연자원",
  "철학",
  "체육",
  "한의",
  "해양",
  "행정",
  "화학",
  "환경",
]
export const EN_THEME = ["e05", "e08", "e12", "e13", "e15", "e18", "e20", "e43"]
export const IJP_EXCEPT = ["OIJ"]
export const KO_IJP = KO_INJEONG.concat(KO_THEME).filter(function (item) {
  return !IJP_EXCEPT.includes(item)
})
export const EN_IJP = EN_INJEONG.concat(EN_THEME).filter(function (item) {
  return !IJP_EXCEPT.includes(item)
})
export const REGION = {
  en: "en",
  ko: "kr",
}
export const KOR_STRICT = /(^|,)(1|INJEONG)($|,)/
export const KOR_GROUP = new RegExp(
  "(,|^)(" +
    [
      "0",
      "1",
      "3",
      "7",
      "8",
      "11",
      "9",
      "16",
      "15",
      "17",
      "2",
      "18",
      "20",
      "26",
      "19",
      "INJEONG",
    ].join("|") +
    ")(,|$)"
)
export const ENG_ID = /^[a-z]+$/i
export const KOR_FLAG = {
  LOANWORD: 1, // 외래어
  INJEONG: 2, // 어인정
  SPACED: 4, // 띄어쓰기를 해야 하는 어휘
  SATURI: 8, // 방언
  OLD: 16, // 옛말
  MUNHWA: 32, // 문화어
}
export const WP_REWARD = () => 10 + Math.floor(Math.random() * 91)
export const getRule = (mode: number) =>
  RULE[GAME_TYPE[mode] as keyof typeof RULE]
