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

import { Logger } from "tslog"
import process from "node:process"

export const logger = new Logger()

process.on("unhandledRejection", (e) => logger.fatal("Unhandled rejection:", e))
process.on("uncaughtException", (e) => logger.fatal("Uncaught exception:", e))

export const log = (text: string) => logger.info(text)
export const info = (text: string) => logger.info(text)
export const success = (text: string) => logger.info(text)
export const alert = (text: string) => logger.warn(text)
export const warn = (text: string) => logger.warn(text)
export const error = (text: string) => logger.error(text)
