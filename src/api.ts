import type { Message } from './types'

const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const ENV_API_KEY = import.meta.env.VITE_ZHIPU_API_KEY
const API_KEY_STORAGE = 'ai-chat-zhipu-api-key'

function getApiKey(): string {
  const stored = localStorage.getItem(API_KEY_STORAGE)?.trim()
  if (stored) return stored
  return (ENV_API_KEY ?? '').trim()
}

export interface StreamCallbacks {
  onChunk: (text: string) => void
  onReasoning?: (text: string) => void
  onDone: () => void
  onError: (error: Error) => void
  signal?: AbortSignal
}

export async function chatStream(messages: Message[], cb: StreamCallbacks) {
  const { onChunk, onReasoning, onDone, onError, signal } = cb

  const apiKey = getApiKey()
  if (!apiKey) {
    onError(new Error('未配置 API Key：请在界面右上角设置，或在构建环境里配置 VITE_ZHIPU_API_KEY'))
    return
  }

  const body = {
    model: 'glm-4-flash',
    messages: messages.map(({ role, content }) => ({ role, content })),
    stream: true,
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      const msg = errorData?.error?.message ?? `请求失败 (${response.status})`
      throw new Error(msg)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('浏览器不支持流式读取')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue

        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') {
          onDone()
          return
        }

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta
          if (delta?.content) onChunk(delta.content)
          if (delta?.reasoning_content && onReasoning) onReasoning(delta.reasoning_content)
        } catch {
          // skip malformed SSE chunks
        }
      }
    }

    onDone()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      onDone()
      return
    }
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}
