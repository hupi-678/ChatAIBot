<script setup lang="ts">
import type { ThemeMode } from '../../composables/useTheme'

defineProps<{
  hasApiKey: boolean
  themeMode: ThemeMode
}>()

const emit = defineEmits<{
  'toggle-sidebar': []
  'open-api-key': []
  'toggle-theme': []
}>()
</script>

<template>
  <header class="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm shrink-0 transition-colors">
    <button class="md:hidden p-1 -ml-1 text-gray-600 dark:text-gray-300" @click="emit('toggle-sidebar')">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
      </svg>
    </button>
    <h1 class="text-lg font-semibold text-gray-800 dark:text-gray-100 truncate flex-1">AI 聊天助手</h1>

    <button
      class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative"
      :title="hasApiKey ? '已配置 API Key' : '未配置 API Key'"
      @click="emit('open-api-key')"
    >
      <span
        class="absolute -right-0.5 -top-0.5 w-2 h-2 rounded-full"
        :class="hasApiKey ? 'bg-green-500' : 'bg-red-500'"
      />
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m-3-3a3 3 0 00-3 3m3-3H8.25m7.5 0H18m-2.25 0a3 3 0 013 3m0 0v1.5a3 3 0 01-3 3H8.25a3 3 0 01-3-3v-1.5a3 3 0 013-3h7.5zM6 15.75h12M6 18.75h12" />
      </svg>
    </button>

    <button
      class="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      :title="`主题: ${themeMode === 'light' ? '浅色' : themeMode === 'dark' ? '深色' : '跟随系统'}`"
      @click="emit('toggle-theme')"
    >
      <svg v-if="themeMode === 'light'" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" />
        <path stroke-linecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
      </svg>
      <svg v-else-if="themeMode === 'dark'" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
      </svg>
      <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
      </svg>
    </button>
  </header>
</template>
