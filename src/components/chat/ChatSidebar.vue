<script setup lang="ts">
import type { Conversation } from '../../types'

defineProps<{
  open: boolean
  sortedConversations: Conversation[]
  activeId: string
}>()

const emit = defineEmits<{
  'new-conversation': []
  'switch-conversation': [id: string]
  'delete-conversation': [id: string]
}>()

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return '今天'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return '昨天'
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <aside
    :class="open ? 'translate-x-0' : '-translate-x-full'"
    class="fixed inset-y-0 left-0 z-30 w-64 flex flex-col bg-gray-900 text-gray-300 transition-transform duration-200 md:static md:translate-x-0 shrink-0"
  >
    <div class="p-3">
      <button
        class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-700 text-sm hover:bg-gray-800 transition-colors"
        @click="emit('new-conversation')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        新建对话
      </button>
    </div>

    <nav class="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
      <button
        v-for="conv in sortedConversations"
        :key="conv.id"
        class="group w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm transition-colors"
        :class="conv.id === activeId
          ? 'bg-gray-700 text-white'
          : 'hover:bg-gray-800 text-gray-400'"
        @click="emit('switch-conversation', conv.id)"
      >
        <svg class="w-4 h-4 shrink-0 opacity-60" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
        <div class="flex-1 min-w-0">
          <div class="truncate">{{ conv.title }}</div>
          <div class="text-[11px] opacity-50 mt-0.5">{{ formatDate(conv.updatedAt) }}</div>
        </div>
        <button
          class="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-red-400 transition-opacity shrink-0"
          title="删除对话"
          @click.stop="emit('delete-conversation', conv.id)"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </button>
    </nav>
  </aside>
</template>
