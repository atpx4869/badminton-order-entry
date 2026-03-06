import { handleTelegramWebhookRequest } from '../server/telegram/webhook-handler.js'

export default async function handler(req, res) {
  return handleTelegramWebhookRequest(req, res)
}

