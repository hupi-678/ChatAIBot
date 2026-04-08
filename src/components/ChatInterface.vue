<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import type { Message, Conversation } from '../types'
import { chatStream } from '../api'
import { renderMarkdown } from '../utils/markdown'
import { useTheme } from '../composables/useTheme'
import { useSpeechInput } from '../composables/useSpeechInput'

const CONV_KEY = 'ai-chat-conversations'
const ACTIVE_KEY = 'ai-chat-active-id'
const OLD_MSG_KEY = 'ai-chat-messages'
const API_KEY_STORAGE = 'ai-chat-zhipu-api-key'
const FLUSH_INTERVAL = 200

const conversations = ref<Conversation[]>([])
const activeId = ref('')
const inputText = ref('')
const isLoading = ref(false)
const errorMsg = ref('')
const scrollerRef = ref<InstanceType<typeof DynamicScroller> | null>(null)
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
    (scrollerRef.value as any)?.scrollToBottom?.()
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

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return '今天'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return '昨天'
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

const copiedIdx = ref<number | null>(null)

const { mode: themeMode, toggleTheme } = useTheme()

const { isListening, interimText, isSupported: speechSupported, toggle: toggleSpeech } =
  useSpeechInput((text) => {
    inputText.value += text
  })

async function copyMessage(content: string, idx: number) {
  try {
    await navigator.clipboard.writeText(content)
    copiedIdx.value = idx
    setTimeout(() => { copiedIdx.value = null }, 1500)
  } catch { /* clipboard API may fail in insecure contexts */ }
}

function handleCodeCopy(e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest('.copy-code-btn') as HTMLElement | null
  if (!btn) return
  const wrapper = btn.closest('.code-block-wrapper')
  const code = wrapper?.querySelector('pre code')?.textContent ?? ''
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = '已复制!'
    setTimeout(() => { btn.textContent = '复制' }, 1500)
  })
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
</script>

<template>
  <div class="flex h-screen bg-gray-100 dark:bg-gray-950 transition-colors">
    <!-- Mobile overlay -->
    <div
      v-if="sidebarOpen"
      class="fixed inset-0 bg-black/40 z-20 md:hidden"
      @click="sidebarOpen = false"
    />

    <!-- Sidebar -->
    <aside
      :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
      class="fixed inset-y-0 left-0 z-30 w-64 flex flex-col bg-gray-900 text-gray-300 transition-transform duration-200 md:static md:translate-x-0 shrink-0"
    >
      <!-- New chat button -->
      <div class="p-3">
        <button
          class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-700 text-sm hover:bg-gray-800 transition-colors"
          @click="newConversation"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          新建对话
        </button>
      </div>

      <!-- Conversation list -->
      <nav class="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        <button
          v-for="conv in sortedConversations"
          :key="conv.id"
          class="group w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm transition-colors"
          :class="conv.id === activeId
            ? 'bg-gray-700 text-white'
            : 'hover:bg-gray-800 text-gray-400'"
          @click="switchConversation(conv.id)"
        >
          <svg class="w-4 h-4 shrink-0 opacity-60" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          <div class="flex-1 min-w-0">
            <div class="truncate">{{ conv.title }}</div>
            <div class="text-[11px] opacity-50 mt-0.5">{{ formatDate(conv.updatedAt) }}</div>
          </div>
          <!-- Delete button -->
          <button
            class="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-red-400 transition-opacity shrink-0"
            title="删除对话"
            @click.stop="deleteConversation(conv.id)"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </button>
      </nav>
    </aside>

    <!-- Main chat area -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Header -->
      <header class="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm shrink-0 transition-colors">
        <!-- Mobile hamburger -->
        <button class="md:hidden p-1 -ml-1 text-gray-600 dark:text-gray-300" @click="sidebarOpen = !sidebarOpen">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <h1 class="text-lg font-semibold text-gray-800 dark:text-gray-100 truncate flex-1">AI 聊天助手</h1>

        <!-- API key settings -->
        <button
          class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative"
          :title="hasApiKey ? '已配置 API Key' : '未配置 API Key'"
          @click="apiKeyOpen = true"
        >
          <span
            class="absolute -right-0.5 -top-0.5 w-2 h-2 rounded-full"
            :class="hasApiKey ? 'bg-green-500' : 'bg-red-500'"
          />
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m-3-3a3 3 0 00-3 3m3-3H8.25m7.5 0H18m-2.25 0a3 3 0 013 3m0 0v1.5a3 3 0 01-3 3H8.25a3 3 0 01-3-3v-1.5a3 3 0 013-3h7.5zM6 15.75h12M6 18.75h12" />
          </svg>
        </button>

        <!-- Theme toggle -->
        <button
          class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          :title="`主题: ${themeMode === 'light' ? '浅色' : themeMode === 'dark' ? '深色' : '跟随系统'}`"
          @click="toggleTheme"
        >
          <!-- Sun (light) -->
          <svg v-if="themeMode === 'light'" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4" />
            <path stroke-linecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
          </svg>
          <!-- Moon (dark) -->
          <svg v-else-if="themeMode === 'dark'" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
          </svg>
          <!-- Monitor (system) -->
          <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
          </svg>
        </button>
      </header>

      <!-- API Key modal -->
      <div
        v-if="apiKeyOpen"
        class="fixed inset-0 z-40 flex items-center justify-center px-4"
      >
        <div class="absolute inset-0 bg-black/40" @click="apiKeyOpen = false" />
        <div class="relative w-full max-w-md rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl p-4 transition-colors">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold text-gray-800 dark:text-gray-100">配置智谱 API Key</div>
            <button class="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" @click="apiKeyOpen = false">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <input
            v-model="apiKeyInput"
            type="password"
            autocomplete="off"
            placeholder="粘贴你的 Key（仅保存在本机浏览器）"
            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-blue-400 dark:focus:border-blue-500"
          />

    

          <div class="flex items-center justify-between mt-4">
            <button
              class="text-sm text-red-500 hover:text-red-600"
              @click="clearApiKey"
            >
              清除
            </button>
            <div class="flex gap-2">
              <button
                class="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                @click="apiKeyOpen = false"
              >
                取消
              </button>
              <button
                class="px-3 py-1.5 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                @click="saveApiKey"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Messages -->
      <main class="flex-1 overflow-hidden relative" @click="handleCodeCopy">
        <!-- Empty state -->
        <div
          v-if="activeMessages.length === 0 && !isLoading"
          class="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 select-none"
        >
          <svg class="w-16 h-16 mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <p class="text-base">开始一段新对话吧</p>
        </div>

        <!-- Virtual-scrolled message list -->
        <DynamicScroller
          v-else
          ref="scrollerRef"
          :items="scrollerItems"
          :min-item-size="60"
          key-field="id"
          class="h-full scroller-container"
        >
          <template #default="{ item, index, active }">
            <DynamicScrollerItem
              :item="item"
              :active="active"
              :size-dependencies="[item.content, item.reasoning]"
              :data-index="index"
            >
              <div class="px-4 py-2.5 flex" :class="item.role === 'user' ? 'justify-end' : 'justify-start'">
                <!-- AI avatar -->
                <div
                  v-if="item.role === 'assistant'"
                  class="w-9 h-9 rounded-full bg-indigo-500 text-white flex items-center justify-center text-sm font-bold shrink-0 mt-1"
                >
                  AI
                </div>

                <div class="flex flex-col max-w-[75%] group/msg" :class="item.role === 'user' ? 'items-end mr-2' : 'items-start ml-2'">
                  <!-- Bubble -->
                  <div
                    class="px-4 py-2.5 rounded-2xl leading-relaxed break-words text-[15px]"
                    :class="item.role === 'user'
                      ? 'bg-blue-500 text-white rounded-tr-sm'
                      : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-sm rounded-tl-sm'"
                  >
                    <!-- User: plain text -->
                    <template v-if="item.role === 'user'">
                      <p class="whitespace-pre-wrap">{{ item.content }}</p>
                    </template>

                    <!-- AI: markdown rendered -->
                    <template v-else>
                      <!-- Reasoning chain -->
                      <div v-if="item.reasoning">
                        <div
                          v-if="isLoading && item._idx === activeMessages.length - 1 && !item.content"
                          class="text-sm"
                        >
                          <div class="text-xs text-indigo-400 font-medium mb-1">💭 推理中...</div>
                          <div class="reasoning-body markdown-body" v-html="renderMarkdown(item.reasoning)" />
                        </div>
                        <details v-else class="mb-2">
                          <summary class="cursor-pointer text-xs text-indigo-400 hover:text-indigo-500 select-none py-0.5">
                            💭 推理过程
                          </summary>
                          <div class="reasoning-body markdown-body mt-1" v-html="renderMarkdown(item.reasoning)" />
                        </details>
                      </div>

                      <div
                        v-if="item.content"
                        class="markdown-body"
                        v-html="renderMarkdown(item.content)"
                      />

                      <span
                        v-if="!item.content && !item.reasoning"
                        class="inline-flex items-center gap-1.5 text-gray-400 text-sm py-0.5"
                      >
                        思考中
                        <span class="inline-flex gap-0.5">
                          <span class="w-1 h-1 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                          <span class="w-1 h-1 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                          <span class="w-1 h-1 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                        </span>
                      </span>
                    </template>

                    <!-- Streaming cursor -->
                    <span
                      v-if="item.role === 'assistant' && isLoading && item._idx === activeMessages.length - 1 && item.content"
                      class="inline-block w-0.5 h-4 bg-gray-400 align-text-bottom ml-0.5 animate-pulse"
                    />
                  </div>

                  <!-- Copy message button -->
                  <button
                    v-if="item.role === 'assistant' && item.content && !(isLoading && item._idx === activeMessages.length - 1)"
                    class="flex items-center gap-1 mt-1 px-1.5 py-0.5 text-[11px] text-gray-400 hover:text-gray-600 rounded opacity-0 group-hover/msg:opacity-100 transition-opacity"
                    @click="copyMessage(item.content, item._idx)"
                  >
                    <svg v-if="copiedIdx !== item._idx" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    <svg v-else class="w-3 h-3 text-green-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{{ copiedIdx === item._idx ? '已复制' : '复制' }}</span>
                  </button>

                  <!-- Timestamp -->
                  <span class="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 px-1">{{ formatTime(item.timestamp) }}</span>
                </div>

                <!-- User avatar -->
                <div
                  v-if="item.role === 'user'"
                  class="w-9 h-9 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold shrink-0 mt-1"
                >
                  我
                </div>
              </div>
            </DynamicScrollerItem>
          </template>
        </DynamicScroller>

        <!-- Error toast (floating) -->
        <div v-if="errorMsg" class="absolute bottom-4 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <div class="bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-sm px-4 py-2 rounded-lg border border-red-200 dark:border-red-800 shadow-md pointer-events-auto">
            {{ errorMsg }}
          </div>
        </div>
      </main>

      <!-- Input area -->
      <footer class="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 transition-colors">
        <!-- Speech interim preview -->
        <div v-if="isListening && interimText" class="max-w-3xl mx-auto mb-1.5">
          <span class="text-xs text-indigo-400 dark:text-indigo-300 animate-pulse">正在识别: {{ interimText }}</span>
        </div>

        <div class="flex items-end gap-2 max-w-3xl mx-auto">
          <textarea
            v-model="inputText"
            rows="1"
            :disabled="isLoading"
            :placeholder="isLoading ? 'AI 思考中...' : '输入消息，Enter 发送，Shift+Enter 换行'"
            class="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-4 py-2.5 text-[15px] text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none transition-colors focus:border-blue-400 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800 disabled:opacity-50 max-h-32 overflow-y-auto"
            @keydown="handleKeydown"
          />

          <!-- Mic button -->
          <button
            v-if="speechSupported && !isLoading"
            class="h-10 w-10 flex items-center justify-center rounded-xl transition-all active:scale-95 shrink-0"
            :class="isListening
              ? 'bg-red-500 text-white animate-pulse'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'"
            :title="isListening ? '停止语音输入' : '语音输入'"
            @click="toggleSpeech"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path v-if="!isListening" stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              <path v-else stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
          </button>

          <button
            v-if="isLoading"
            class="h-10 px-5 rounded-xl bg-gray-500 text-white font-medium text-sm transition-all hover:bg-gray-600 active:scale-95 shrink-0"
            @click="abortRequest"
          >
            停止
          </button>
          <button
            v-else
            :disabled="!inputText.trim()"
            class="h-10 px-5 rounded-xl bg-blue-500 text-white font-medium text-sm transition-all hover:bg-blue-600 active:scale-95 disabled:opacity-40 disabled:pointer-events-none shrink-0"
            @click="sendMessage"
          >
            发送
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
:deep(.markdown-body) {
  line-height: 1.7;
}

:deep(.markdown-body p) {
  margin: 0.4em 0;
}
:deep(.markdown-body p:first-child) {
  margin-top: 0;
}
:deep(.markdown-body p:last-child) {
  margin-bottom: 0;
}

:deep(.markdown-body .code-block-wrapper) {
  margin: 0.6em 0;
  border-radius: 0.5rem;
  overflow: hidden;
  background: #1e1e2e;
}

:deep(.markdown-body .code-block-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35em 0.8em;
  background: #181825;
  font-size: 12px;
}

:deep(.markdown-body .code-lang) {
  color: #9399b2;
}

:deep(.markdown-body .copy-code-btn) {
  color: #9399b2;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  padding: 0.1em 0.4em;
  border-radius: 0.25rem;
  transition: color 0.15s, background 0.15s;
}
:deep(.markdown-body .copy-code-btn:hover) {
  color: #cdd6f4;
  background: rgba(255,255,255,0.08);
}

:deep(.markdown-body pre) {
  margin: 0;
  padding: 0.8em 1em;
  background: #1e1e2e;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.5;
}

:deep(.markdown-body pre code) {
  color: #cdd6f4;
  background: none;
  padding: 0;
  font-size: inherit;
}

:deep(.markdown-body code) {
  background: var(--md-code-bg);
  padding: 0.15em 0.4em;
  border-radius: 0.25rem;
  font-size: 0.9em;
  color: var(--md-code-color);
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  padding-left: 1.5em;
  margin: 0.4em 0;
}
:deep(.markdown-body ul) {
  list-style-type: disc;
}
:deep(.markdown-body ol) {
  list-style-type: decimal;
}

:deep(.markdown-body li) {
  margin: 0.2em 0;
}

:deep(.markdown-body blockquote) {
  margin: 0.5em 0;
  padding: 0.3em 0.8em;
  border-left: 3px solid var(--md-blockquote-border);
  color: var(--md-blockquote-color);
  background: var(--md-blockquote-bg);
  border-radius: 0 0.25rem 0.25rem 0;
}

:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3) {
  margin: 0.6em 0 0.3em;
  font-weight: 600;
  color: var(--md-heading-color);
}
:deep(.markdown-body h1) { font-size: 1.3em; }
:deep(.markdown-body h2) { font-size: 1.15em; }
:deep(.markdown-body h3) { font-size: 1.05em; }

:deep(.markdown-body a) {
  color: #3b82f6;
  text-decoration: underline;
}

:deep(.markdown-body table) {
  border-collapse: collapse;
  margin: 0.5em 0;
  font-size: 0.9em;
  width: 100%;
}
:deep(.markdown-body th),
:deep(.markdown-body td) {
  border: 1px solid var(--md-table-border);
  padding: 0.4em 0.6em;
  text-align: left;
}
:deep(.markdown-body th) {
  background: var(--md-table-header-bg);
  font-weight: 600;
}

:deep(.markdown-body hr) {
  border: none;
  border-top: 1px solid var(--md-hr-color);
  margin: 0.8em 0;
}

:deep(.reasoning-body) {
  color: var(--md-reasoning-color);
  font-style: italic;
  font-size: 0.9em;
  border-left: 2px solid var(--md-reasoning-border);
  padding-left: 0.6em;
}

.scroller-container :deep(.vue-recycle-scroller__item-wrapper) {
  padding-top: 1rem;
  padding-bottom: 1rem;
}
</style>
