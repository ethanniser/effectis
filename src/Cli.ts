import * as Command from "@effect/cli/Command"
import { main } from "./main.js"

const command = Command.make("redis-effect", {}, () => main)

export const run = Command.run(command, {
  name: "redis-effect",
  version: "0.0.0"
})
