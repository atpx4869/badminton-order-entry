import { assertTelegramConfig, assertTelegramWebhookConfig, getTelegramConfig } from '../config/telegram-config.js'
import { createTelegramClient } from './telegram-client.js'

async function main() {
  const config = getTelegramConfig()
  assertTelegramConfig(config)
  assertTelegramWebhookConfig(config)

  const client = createTelegramClient(config)
  const result = await client.setWebhook(config.webhookUrl, config.webhookSecretToken)
  console.log(JSON.stringify({ ok: true, webhookUrl: config.webhookUrl, result }, null, 2))
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[telegram-webhook-register] ${message}`)
  process.exitCode = 1
})

