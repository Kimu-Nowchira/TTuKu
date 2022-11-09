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

import { spawn } from "child_process"
import { unlink } from "fs"

const doStep = () => {
  const next = step.shift()

  if (next) next()
  else {
    console.log("Completed.")
    process.exit()
  }
}

const removeCmd = (cmd: string) => {
  const f1 = `./${cmd}`
  const f2 = `./${cmd}.cmd`

  unlink(f1, () => unlink(f2, doStep))
}

const summon = (cmd: string) => {
  console.log(cmd)

  const args = cmd.split(" ")
  const proc = spawn(args[0], args.slice(1), { shell: true })

  proc.stdout.on("data", (msg: string) => {
    console.log(msg.toString())
  })
  proc.on("close", doStep)
}

const step: (() => void)[] = [
  () => {
    console.log("Please wait... This may take several minutes.")
    doStep()
  },
  () => summon("npm install"),
  () => summon(`npm install . --prefix "."`),
  () => removeCmd("acorn"),
  () => removeCmd("cake"),
  () => removeCmd("coffee"),
  () => removeCmd("cleancss"),
  () => removeCmd("dateformat"),
  () => removeCmd("esparse"),
  () => removeCmd("esvalidate"),
  () => removeCmd("gzip-size"),
  () => removeCmd("js-yaml"),
  () => removeCmd("mime"),
  () => removeCmd("nopt"),
  () => removeCmd("pretty-bytes"),
  () => removeCmd("rimraf"),
  () => removeCmd("semver"),
  () => removeCmd("strip-indent"),
  () => removeCmd("uglifyjs"),
  () => removeCmd("which"),
]

doStep()
