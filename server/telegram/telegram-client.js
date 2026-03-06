export function createTelegramClient(config) {
  const jsonHeaders = { 'Content-Type': 'application/json' }

  function shouldRetryWithoutReply(error) {
    const message = error instanceof Error ? error.message : String(error)
    return message.includes('message to be replied not found')
  }

  async function request(method, init = {}) {
    const response = await fetch(`${config.apiBase}/bot${config.token}/${method}`, init)
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data?.ok === false) {
      const message = data?.description || `Telegram API 调用失败: ${method}`
      throw new Error(message)
    }
    return data.result
  }

  async function requestJsonWithOptionalReply(method, payload) {
    try {
      return await request(method, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      })
    } catch (error) {
      if (!payload.reply_to_message_id || !shouldRetryWithoutReply(error)) {
        throw error
      }
      const retryPayload = { ...payload }
      delete retryPayload.reply_to_message_id
      return request(method, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(retryPayload),
      })
    }
  }

  async function requestFormDataWithOptionalReply(method, formData, replyToMessageId) {
    try {
      return await request(method, {
        method: 'POST',
        body: formData,
      })
    } catch (error) {
      if (!replyToMessageId || !shouldRetryWithoutReply(error)) {
        throw error
      }
      const retryFormData = new FormData()
      for (const [key, value] of formData.entries()) {
        if (key !== 'reply_to_message_id') {
          retryFormData.append(key, value)
        }
      }
      return request(method, {
        method: 'POST',
        body: retryFormData,
      })
    }
  }

  return {
    request,
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
      return requestJsonWithOptionalReply('sendMessage', {
        chat_id: chatId,
        text,
        reply_to_message_id: replyToMessageId,
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
      return requestFormDataWithOptionalReply('sendDocument', formData, replyToMessageId)
    },
    getFile(fileId) {
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
    setWebhook(url, secretToken) {
      const payload = {
        url,
        allowed_updates: ['message'],
      }
      if (secretToken) {
        payload.secret_token = secretToken
      }
      return request('setWebhook', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      })
    },
    deleteWebhook(dropPendingUpdates = false) {
      return request('deleteWebhook', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ drop_pending_updates: dropPendingUpdates }),
      })
    },
    getWebhookInfo() {
      return request('getWebhookInfo', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({}),
      })
    },
  }
}
