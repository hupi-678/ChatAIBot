import { ref, computed, nextTick, onMounted, watch, type Ref } from 'vue'
import type { Message, Conversation } from '../types'
import { chatStream } from '../api'

export type ChatMessagesExpose = {
  scrollToBottom: () => void
  scrollToBottomIfNear: () => void
}

export const CONV_KEY = 'ai-chat-conversations'
export const ACTIVE_KEY = 'ai-chat-active-id'
const OLD_MSG_KEY = 'ai-chat-messages'
export const API_KEY_STORAGE = 'ai-chat-zhipu-api-key'

// Typewriter tuning. Chars arrive in bursts from the network; we drain them
// to the DOM on every animation frame at a comfortable reading speed, and
// ramp the speed up when a big backlog builds so we never fall too far
// behind the server. Tuned to feel natural for Chinese content (higher
// information density per character ⇒ lower comfortable cps than English).
const BASE_CHARS_PER_SEC = 35
const MAX_CHARS_PER_SEC = 500
const CATCHUP_FACTOR = 2.2

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

  let pendingContent = ''
  let pendingReasoning = ''
  let rafHandle: number | null = null
  let lastFrameTime = 0
  let currentAiIndex = -1

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
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          conversations.value = parsed.filter((c): c is Conversation =>
            !!c
            && typeof c.id === 'string'
            && typeof c.title === 'string'
            && Array.isArray(c.messages)
            && typeof c.updatedAt === 'number'
          )
        }
      } catch { /* ignore corrupt JSON */ }
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
    try {
      localStorage.setItem(CONV_KEY, JSON.stringify(val))
    } catch {
      // localStorage may throw on quota exceeded or in private mode.
    }
  }, { deep: true })

  watch(activeId, (val) => {
    try {
      localStorage.setItem(ACTIVE_KEY, val)
    } catch { /* ignore */ }
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
        // Match the sidebar order (sorted by updatedAt desc) so the user
        // ends up on the most-recently-used remaining conversation.
        activeId.value = sortedConversations.value[0]?.id ?? conversations.value[0].id
      } else {
        newConversation()
      }
    }
  }

  function abortAndReset() {
    abortController.value?.abort()
    flushPendingNow()
    if (currentAiIndex >= 0) {
      const c = getActiveConv()
      const msg = c?.messages[currentAiIndex]
      if (msg && msg.role === 'assistant' && !msg.content && !msg.reasoning) {
        c!.messages.splice(currentAiIndex, 1)
      }
    }
    isLoading.value = false
    abortController.value = null
    currentAiIndex = -1
  }

  function scrollToBottom() {
    nextTick(() => {
      messagesListRef.value?.scrollToBottom()
    })
  }

  // Used during streaming — only follows if the user is still near the bottom.
  function stickyScroll() {
    nextTick(() => {
      messagesListRef.value?.scrollToBottomIfNear()
    })
  }

  function getActiveConv(): Conversation | undefined {
    return conversations.value.find(c => c.id === activeId.value)
  }

  function drainTick() {
    rafHandle = null
    const now = performance.now()
    const dt = lastFrameTime ? Math.min(0.1, (now - lastFrameTime) / 1000) : 1 / 60
    lastFrameTime = now

    const backlog = pendingContent.length + pendingReasoning.length
    const speed = Math.min(
      MAX_CHARS_PER_SEC,
      Math.max(BASE_CHARS_PER_SEC, backlog * CATCHUP_FACTOR)
    )
    let budget = Math.max(1, Math.ceil(speed * dt))

    if (currentAiIndex >= 0) {
      const conv = getActiveConv()
      const msg = conv?.messages[currentAiIndex]
      if (msg) {
        if (pendingReasoning && budget > 0) {
          const take = Math.min(pendingReasoning.length, budget)
          msg.reasoning = (msg.reasoning ?? '') + pendingReasoning.slice(0, take)
          pendingReasoning = pendingReasoning.slice(take)
          budget -= take
        }
        if (pendingContent && budget > 0) {
          const take = Math.min(pendingContent.length, budget)
          msg.content += pendingContent.slice(0, take)
          pendingContent = pendingContent.slice(take)
          budget -= take
        }
        stickyScroll()
      }
    }

    if (pendingContent || pendingReasoning) {
      rafHandle = requestAnimationFrame(drainTick)
    } else {
      lastFrameTime = 0
    }
  }

  function startPlayback() {
    if (rafHandle != null) return
    lastFrameTime = 0
    rafHandle = requestAnimationFrame(drainTick)
  }

  // Dump everything still queued straight into the current message — used when
  // the stream ends or is aborted, so the user doesn't see the typewriter
  // trailing after the AI has already finished speaking.
  function flushPendingNow() {
    if (rafHandle != null) {
      cancelAnimationFrame(rafHandle)
      rafHandle = null
    }
    lastFrameTime = 0
    if (currentAiIndex >= 0) {
      const conv = getActiveConv()
      const msg = conv?.messages[currentAiIndex]
      if (msg) {
        if (pendingReasoning) {
          msg.reasoning = (msg.reasoning ?? '') + pendingReasoning
        }
        if (pendingContent) {
          msg.content += pendingContent
        }
        stickyScroll()
      }
    }
    pendingContent = ''
    pendingReasoning = ''
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
    const controller = new AbortController()
    abortController.value = controller
    // Capture per-stream identity so stale callbacks (after switch/abort) do not
    // mutate state belonging to a newer stream.
    const streamConvId = conv.id
    const streamAiIdx = currentAiIndex
    const isStale = () => abortController.value !== controller

    isLoading.value = true
    scrollToBottom()

    await chatStream(conv.messages.slice(0, currentAiIndex), {
      onChunk(chunk) {
        if (isStale()) return
        pendingContent += chunk
        startPlayback()
      },
      onReasoning(chunk) {
        if (isStale()) return
        pendingReasoning += chunk
        startPlayback()
      },
      onDone() {
        if (isStale()) return
        flushPendingNow()
        const c = conversations.value.find(x => x.id === streamConvId)
        const msg = c?.messages[streamAiIdx]
        if (c && msg) {
          if (!msg.content && !msg.reasoning) {
            // Aborted before any output arrived — drop the empty placeholder.
            c.messages.splice(streamAiIdx, 1)
          } else {
            msg.timestamp = Date.now()
          }
          c.updatedAt = Date.now()
        }
        isLoading.value = false
        abortController.value = null
        currentAiIndex = -1
        scrollToBottom()
      },
      onError(error) {
        if (isStale()) return
        flushPendingNow()
        const c = conversations.value.find(x => x.id === streamConvId)
        if (c && !c.messages[streamAiIdx]?.content && !c.messages[streamAiIdx]?.reasoning) {
          c.messages.splice(streamAiIdx, 1)
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
