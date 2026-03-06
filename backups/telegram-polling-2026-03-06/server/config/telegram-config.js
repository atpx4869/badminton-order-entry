import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function parseInteger(value, fallback) {
  const next = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(next) ? next : fallback
}

function loadDotEnvFile() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) {
    return {}
  }

  const content = readFileSync(envPath, 'utf8')
  return content.split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      return acc
    }
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) {
      return acc
    }
    const key = trimmed.slice(0, separatorIndex).trim()
    const rawValue = trimmed.slice(separatorIndex + 1).trim()
    const value = rawValue.replace(/^['"]|['"]$/g, '')
    acc[key] = value
    return acc
  }, {})
}

function parseAllowedChatIds(value) {
  const items = String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return new Set(items)
}

export function getTelegramConfig(env = process.env) {
  const envFile = loadDotEnvFile()
  const mergedEnv = {
    ...envFile,
    ...env,
  }
  const token = String(mergedEnv.TELEGRAM_BOT_TOKEN ?? '').trim()
  const apiBase = String(mergedEnv.TELEGRAM_API_BASE ?? 'https://api.telegram.org').replace(/\/$/, '')
  return {
    token,
    apiBase,
    fileBase: String(mergedEnv.TELEGRAM_FILE_BASE ?? apiBase).replace(/\/$/, ''),
    pollingTimeoutSec: parseInteger(mergedEnv.TELEGRAM_POLLING_TIMEOUT_SEC, 30),
    retryDelayMs: parseInteger(mergedEnv.TELEGRAM_RETRY_DELAY_MS, 3000),
    allowedChatIds: parseAllowedChatIds(mergedEnv.TELEGRAM_ALLOWED_CHAT_IDS),
  }
}

export function assertTelegramConfig(config) {
  if (!config.token) {
    throw new Error('缺少环境变量 TELEGRAM_BOT_TOKEN')
  }
}
