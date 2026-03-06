import { buildParseWorkbook } from '../../shared/export/excel-export.js'
import { parseInputText, summarizeParseReport } from '../../shared/parser/order-parser.js'

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

export async function handleTelegramMessage(client, config, message) {
  const chatId = message?.chat?.id
  const messageId = message?.message_id
  if (!chatId || !isAllowedChat(config, chatId)) {
    return false
  }

  const text = String(message.text ?? '').trim()
  if (text === '/start' || text === '/help') {
    await client.sendMessage(chatId, buildHelpText(), messageId)
    return true
  }

  const extracted = await extractTextFromMessage(client, message)
  if (!extracted) {
    await client.sendMessage(chatId, '请直接发送订单文本，或上传 `.txt` 文件。', messageId)
    return false
  }
  if (extracted.error) {
    await client.sendMessage(chatId, extracted.error, messageId)
    return false
  }

  const report = parseInputText(extracted.sourceText)
  const { buffer, filename } = buildParseWorkbook(report, {
    label: extracted.sourceLabel,
  })

  await client.sendDocument(chatId, buffer, filename, buildCaption(report), messageId)
  return true
}

export async function handleTelegramUpdate(client, config, update) {
  if (update?.message) {
    return handleTelegramMessage(client, config, update.message)
  }
  return false
}

