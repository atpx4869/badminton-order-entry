import { assertTelegramConfig, getTelegramConfig } from '../config/telegram-config.js'
import { createTelegramClient } from './telegram-client.js'

async function main() {
  const config = getTelegramConfig()
  assertTelegramConfig(config)

  const client = createTelegramClient(config)
  const result = await client.deleteWebhook(false)
  console.log(JSON.stringify({ ok: true, result }, null, 2))
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[telegram-webhook-delete] ${message}`)
  process.exitCode = 1
})

