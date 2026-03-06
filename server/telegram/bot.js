import { pathToFileURL } from 'node:url'

import { assertTelegramConfig, getTelegramConfig } from '../config/telegram-config.js'
import { handleTelegramUpdate } from './message-handler.js'
import { createTelegramClient } from './telegram-client.js'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function startTelegramBot() {
  const config = getTelegramConfig()
  assertTelegramConfig(config)

  const client = createTelegramClient(config)
  let offset = 0

  console.log('[telegram-bot] started')

  for (;;) {
    try {
      const updates = await client.getUpdates(offset)
      for (const update of updates) {
        offset = Math.max(offset, Number(update.update_id ?? 0) + 1)
        await handleTelegramUpdate(client, config, update)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[telegram-bot] ${message}`)
      await sleep(config.retryDelayMs)
    }
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  startTelegramBot().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[telegram-bot] ${message}`)
    process.exitCode = 1
  })
}
