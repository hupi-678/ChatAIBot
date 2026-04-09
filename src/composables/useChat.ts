import { ref, computed, nextTick, onMounted, watch, type Ref } from 'vue'
import type { Message, Conversation } from '../types'
import { chatStream } from '../api'

export type ChatMessagesExpose = { scrollToBottom: () => void }

export const CONV_KEY = 'ai-chat-conversations'
export const ACTIVE_KEY = 'ai-chat-active-id'
const OLD_MSG_KEY = 'ai-chat-messages'
export const API_KEY_STORAGE = 'ai-chat-zhipu-api-key'
const FLUSH_INTERVAL = 200

export function useChat(messagesListRef: Ref<ChatMessagesExpose | null>) {
  const conversations = ref<Conversation[]>([])
  const activeId = ref('')
  const inputText = ref('')
  const isLoading = ref(false)
  const errorMsg = ref('')
  const abortController = ref<AbortController | null>(null)
  const sidebarOpen = ref(false)
  const apiKeyOpen = ref(false)
  const apiKeyInput = ref('')
  const apiKeySaved = ref('')

  const hasApiKey = computed(() => !!apiKeySaved.value.trim())

  let contentBuffer = ''
  let reasoningBuffer = ''
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let currentAiIndex = -1
  let isFirstChunk = true

  const activeMessages = computed(() => {
    const conv = conversations.value.find(c => c.id === activeId.value)
    return conv?.messages ?? []
  })

  const scrollerItems = computed(() =>
    activeMessages.value.map((msg, idx) => ({
      ...msg,
      id: `${activeId.value}-${idx}`,
      _idx: idx,
    }))
  )

  const sortedConversations = computed(() =>
    [...conversations.value].sort((a, b) => b.updatedAt - a.updatedAt)
  )

  onMounted(() => {
    apiKeySaved.value = localStorage.getItem(API_KEY_STORAGE) ?? ''
    apiKeyInput.value = apiKeySaved.value

    const saved = localStorage.getItem(CONV_KEY)
    if (saved) {
      try {
        conversations.value = JSON.parse(saved)
      } catch { /* ignore */ }
      activeId.value = localStorage.getItem(ACTIVE_KEY) ?? ''
      if (!conversations.value.find(c => c.id === activeId.value)) {
        activeId.value = conversations.value[0]?.id ?? ''
      }
    } else {
      const oldData = localStorage.getItem(OLD_MSG_KEY)
      if (oldData) {
        try {
          const msgs: Message[] = JSON.parse(oldData)
          if (msgs.length) {
            const conv = makeConversation(msgs)
            conversations.value = [conv]
            activeId.value = conv.id
            localStorage.removeItem(OLD_MSG_KEY)
          }
        } catch { /* ignore */ }
      }
    }
    if (!conversations.value.length) newConversation()
    scrollToBottom()
  })

  watch(conversations, (val) => {
    localStorage.setItem(CONV_KEY, JSON.stringify(val))
  }, { deep: true })

  watch(activeId, (val) => {
    localStorage.setItem(ACTIVE_KEY, val)
  })

  function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  }

  function titleFromMessages(msgs: Message[]): string {
    const first = msgs.find(m => m.role === 'user')
    if (!first) return '新对话'
    const text = first.content.trim()
    return text.length > 20 ? text.slice(0, 20) + '...' : text
  }

  function makeConversation(msgs: Message[]): Conversation {
    return {
      id: generateId(),
      title: titleFromMessages(msgs),
      messages: msgs,
      updatedAt: Date.now(),
    }
  }

  function newConversation() {
    abortAndReset()
    const conv: Conversation = {
      id: generateId(),
      title: '新对话',
      messages: [],
      updatedAt: Date.now(),
    }
    conversations.value.unshift(conv)
    activeId.value = conv.id
    sidebarOpen.value = false
    errorMsg.value = ''
    nextTick(() => scrollToBottom())
  }

  function switchConversation(id: string) {
    if (id === activeId.value) return
    abortAndReset()
    activeId.value = id
    sidebarOpen.value = false
    errorMsg.value = ''
    nextTick(() => scrollToBottom())
  }

  function deleteConversation(id: string) {
    const idx = conversations.value.findIndex(c => c.id === id)
    if (idx === -1) return
    if (id === activeId.value) abortAndReset()
    conversations.value.splice(idx, 1)
    if (activeId.value === id) {
      if (conversations.value.length) {
        activeId.value = conversations.value[0].id
      } else {
        newConversation()
      }
    }
  }

  function abortAndReset() {
    abortController.value?.abort()
    immediateFlush()
    isLoading.value = false
    abortController.value = null
    currentAiIndex = -1
  }

  function scrollToBottom() {
    nextTick(() => {
      messagesListRef.value?.scrollToBottom()
    })
  }

  function getActiveConv(): Conversation | undefined {
    return conversations.value.find(c => c.id === activeId.value)
  }

  function flushBuffers() {
    if (currentAiIndex < 0) return
    const conv = getActiveConv()
    if (!conv) return
    const msg = conv.messages[currentAiIndex]
    if (!msg) return

    if (contentBuffer) {
      msg.content += contentBuffer
      contentBuffer = ''
    }
    if (reasoningBuffer) {
      msg.reasoning = (msg.reasoning ?? '') + reasoningBuffer
      reasoningBuffer = ''
    }
    scrollToBottom()
  }

  function scheduleFlush() {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushBuffers()
      flushTimer = null
    }, FLUSH_INTERVAL)
  }

  function immediateFlush() {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    flushBuffers()
  }

  async function sendMessage() {
    const text = inputText.value.trim()
    if (!text || isLoading.value) return

    const conv = getActiveConv()
    if (!conv) return

    errorMsg.value = ''
    inputText.value = ''

    conv.messages.push({ role: 'user', content: text, timestamp: Date.now() })
    conv.messages.push({ role: 'assistant', content: '', timestamp: Date.now() })

    if (conv.title === '新对话') {
      conv.title = text.length > 20 ? text.slice(0, 20) + '...' : text
    }
    conv.updatedAt = Date.now()

    currentAiIndex = conv.messages.length - 1
    isFirstChunk = true
    const controller = new AbortController()
    abortController.value = controller

    isLoading.value = true
    scrollToBottom()

    await chatStream(conv.messages.slice(0, currentAiIndex), {
      onChunk(chunk) {
        contentBuffer += chunk
        if (isFirstChunk) {
          isFirstChunk = false
          immediateFlush()
        } else {
          scheduleFlush()
        }
      },
      onReasoning(chunk) {
        reasoningBuffer += chunk
        if (isFirstChunk) {
          isFirstChunk = false
          immediateFlush()
        } else {
          scheduleFlush()
        }
      },
      onDone() {
        immediateFlush()
        const c = getActiveConv()
        if (c && currentAiIndex >= 0 && c.messages[currentAiIndex]) {
          c.messages[currentAiIndex].timestamp = Date.now()
          c.updatedAt = Date.now()
        }
        isLoading.value = false
        abortController.value = null
        currentAiIndex = -1
        scrollToBottom()
      },
      onError(error) {
        immediateFlush()
        const c = getActiveConv()
        if (c && currentAiIndex >= 0 && !c.messages[currentAiIndex]?.content) {
          c.messages.pop()
        }
        errorMsg.value = error.message
        isLoading.value = false
        abortController.value = null
        currentAiIndex = -1
        scrollToBottom()
      },
      signal: controller.signal,
    })
  }

  function abortRequest() {
    abortController.value?.abort()
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function saveApiKey() {
    const key = apiKeyInput.value.trim()
    if (key) {
      localStorage.setItem(API_KEY_STORAGE, key)
      apiKeySaved.value = key
    } else {
      localStorage.removeItem(API_KEY_STORAGE)
      apiKeySaved.value = ''
    }
    apiKeyOpen.value = false
  }

  function clearApiKey() {
    localStorage.removeItem(API_KEY_STORAGE)
    apiKeyInput.value = ''
    apiKeySaved.value = ''
  }

  return {
    conversations,
    activeId,
    inputText,
    isLoading,
    errorMsg,
    sidebarOpen,
    apiKeyOpen,
    apiKeyInput,
    apiKeySaved,
    hasApiKey,
    activeMessages,
    scrollerItems,
    sortedConversations,
    newConversation,
    switchConversation,
    deleteConversation,
    sendMessage,
    abortRequest,
    handleKeydown,
    saveApiKey,
    clearApiKey,
  }
}
