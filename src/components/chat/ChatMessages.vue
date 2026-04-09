<script setup lang="ts">
import { ref } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import type { Message } from '../../types'
import { renderMarkdown } from '../../utils/markdown'

type ScrollerItem = Message & { id: string; _idx: number }

defineProps<{
  activeMessages: Message[]
  scrollerItems: ScrollerItem[]
  isLoading: boolean
  errorMsg: string
}>()

const scrollerRef = ref<InstanceType<typeof DynamicScroller> | null>(null)

const copiedIdx = ref<number | null>(null)

function scrollToBottom() {
  ;(scrollerRef.value as { scrollToBottom?: () => void } | null)?.scrollToBottom?.()
}

defineExpose({ scrollToBottom })

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

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <main class="flex-1 overflow-hidden relative" @click="handleCodeCopy">
    <div
      v-if="activeMessages.length === 0 && !isLoading"
      class="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 select-none"
    >
      <svg class="w-16 h-16 mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
      <p class="text-base">开始一段新对话吧</p>
    </div>

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
            <div
              v-if="item.role === 'assistant'"
              class="w-9 h-9 rounded-full bg-indigo-500 text-white flex items-center justify-center text-sm font-bold shrink-0 mt-1"
            >
              AI
            </div>

            <div class="flex flex-col max-w-[75%] group/msg" :class="item.role === 'user' ? 'items-end mr-2' : 'items-start ml-2'">
              <div
                class="px-4 py-2.5 rounded-2xl leading-relaxed break-words text-[15px]"
                :class="item.role === 'user'
                  ? 'bg-blue-500 text-white rounded-tr-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-sm rounded-tl-sm'"
              >
                <template v-if="item.role === 'user'">
                  <p class="whitespace-pre-wrap">{{ item.content }}</p>
                </template>

                <template v-else>
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

                <span
                  v-if="item.role === 'assistant' && isLoading && item._idx === activeMessages.length - 1 && item.content"
                  class="inline-block w-0.5 h-4 bg-gray-400 align-text-bottom ml-0.5 animate-pulse"
                />
              </div>

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

              <span class="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 px-1">{{ formatTime(item.timestamp) }}</span>
            </div>

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

    <div v-if="errorMsg" class="absolute bottom-4 left-0 right-0 flex justify-center z-10 pointer-events-none">
      <div class="bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-sm px-4 py-2 rounded-lg border border-red-200 dark:border-red-800 shadow-md pointer-events-auto">
        {{ errorMsg }}
      </div>
    </div>
  </main>
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
