import { pathToFileURL } from 'node:url'

import { buildParseWorkbook } from '../../shared/export/excel-export.js'
import { parseInputText, summarizeParseReport } from '../../shared/parser/order-parser.js'
import { assertTelegramConfig, getTelegramConfig } from '../config/telegram-config.js'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createTelegramClient(config) {
  const jsonHeaders = { 'Content-Type': 'application/json' }

  async function request(method, init = {}) {
    const response = await fetch(`${config.apiBase}/bot${config.token}/${method}`, init)
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data?.ok === false) {
      const message = data?.description || `Telegram API 调用失败: ${method}`
      throw new Error(message)
    }
    return data.result
  }

  return {
    getUpdates(offset) {
      return request('getUpdates', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          offset,
          timeout: config.pollingTimeoutSec,
          allowed_updates: ['message'],
        }),
      })
    },
    sendMessage(chatId, text, replyToMessageId) {
      return request('sendMessage', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          chat_id: chatId,
          text,
          reply_to_message_id: replyToMessageId,
        }),
      })
    },
    sendDocument(chatId, buffer, filename, caption, replyToMessageId) {
      const formData = new FormData()
      formData.append('chat_id', String(chatId))
      formData.append('caption', caption)
      if (replyToMessageId) {
        formData.append('reply_to_message_id', String(replyToMessageId))
      }
      formData.append(
        'document',
        new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        filename,
      )
      return request('sendDocument', {
        method: 'POST',
        body: formData,
      })
    },
    async getFile(fileId) {
      return request('getFile', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ file_id: fileId }),
      })
    },
    async downloadFile(filePath) {
      const response = await fetch(`${config.fileBase}/file/bot${config.token}/${filePath}`)
      if (!response.ok) {
        throw new Error('下载 Telegram 文件失败')
      }
      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)
    },
  }
}

function isAllowedChat(config, chatId) {
  if (!config.allowedChatIds.size) {
    return true
  }
  return config.allowedChatIds.has(String(chatId))
}

function buildHelpText() {
  return [
    '把订单文本直接发给我，或上传 `.txt` 文件。',
    '我会自动解析并返回 Excel。',
    '如果有待确认或无法识别的内容，会在 Excel 里标出来，并在回复里提示。',
  ].join('\n')
}

function buildCaption(report) {
  const lines = [summarizeParseReport(report)]
  if (report.warningCount > 0) {
    lines.push(`待确认 ${report.warningCount} 条，已在 Excel 中标黄。`)
  }
  if (report.failedCount > 0) {
    lines.push(`无法识别 ${report.failedCount} 条，已写入“识别失败”工作表。`)
  }
  if (report.successCount === 0 && report.warningCount === 0) {
    lines.push('这次没有识别到可导入订单，请检查格式后重试。')
  }
  return lines.join('\n')
}

async function extractTextFromMessage(client, message) {
  if (typeof message.text === 'string' && message.text.trim()) {
    return {
      sourceText: message.text.trim(),
      sourceLabel: 'text',
    }
  }

  const document = message.document
  if (!document) {
    return null
  }

  const fileName = String(document.file_name ?? '')
  const mimeType = String(document.mime_type ?? '')
  const isTxt = /\.txt$/i.test(fileName) || mimeType === 'text/plain'
  if (!isTxt) {
    return {
      error: '目前只支持直接发送文本，或上传 `.txt` 文件。',
    }
  }

  const fileMeta = await client.getFile(document.file_id)
  const buffer = await client.downloadFile(fileMeta.file_path)
  const sourceText = buffer.toString('utf8').trim()
  if (!sourceText) {
    return {
      error: '收到的 txt 文件内容为空，请检查后重试。',
    }
  }

  return {
    sourceText,
    sourceLabel: 'txt',
  }
}

async function handleMessage(client, config, message) {
  const chatId = message?.chat?.id
  const messageId = message?.message_id
  if (!chatId || !isAllowedChat(config, chatId)) {
    return
  }

  const text = String(message.text ?? '').trim()
  if (text === '/start' || text === '/help') {
    await client.sendMessage(chatId, buildHelpText(), messageId)
    return
  }

  const extracted = await extractTextFromMessage(client, message)
  if (!extracted) {
    await client.sendMessage(chatId, '请直接发送订单文本，或上传 `.txt` 文件。', messageId)
    return
  }
  if (extracted.error) {
    await client.sendMessage(chatId, extracted.error, messageId)
    return
  }

  const report = parseInputText(extracted.sourceText)
  const { buffer, filename } = buildParseWorkbook(report, {
    label: extracted.sourceLabel,
  })

  await client.sendDocument(chatId, buffer, filename, buildCaption(report), messageId)
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
        if (update.message) {
          await handleMessage(client, config, update.message)
        }
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

