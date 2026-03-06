import { assertTelegramConfig, getTelegramConfig } from '../config/telegram-config.js'
import { createTelegramClient } from './telegram-client.js'
import { handleTelegramUpdate } from './message-handler.js'

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body)
  }

  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (!chunks.length) {
    return {}
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim()
  return raw ? JSON.parse(raw) : {}
}

function isSecretTokenValid(config, req) {
  if (!config.webhookSecretToken) {
    return true
  }
  const headerValue = req.headers['x-telegram-bot-api-secret-token']
  return String(headerValue ?? '') === config.webhookSecretToken
}

export async function handleTelegramWebhookRequest(req, res) {
  if (req.method === 'GET') {
    sendJson(res, 200, { ok: true, mode: 'telegram-webhook' })
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method Not Allowed' })
    return
  }

  try {
    const config = getTelegramConfig()
    assertTelegramConfig(config)

    if (!isSecretTokenValid(config, req)) {
      sendJson(res, 401, { ok: false, error: 'Invalid secret token' })
      return
    }

    const update = await readJsonBody(req)
    const client = createTelegramClient(config)
    await handleTelegramUpdate(client, config, update)
    sendJson(res, 200, { ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[telegram-webhook] ${message}`)
    sendJson(res, 500, { ok: false, error: message })
  }
}

