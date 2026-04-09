<script setup lang="ts">
defineProps<{
  modelValue: string
  isLoading: boolean
  isListening: boolean
  interimText: string
  speechSupported: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  keydown: [e: KeyboardEvent]
  send: []
  abort: []
  'toggle-speech': []
}>()
</script>

<template>
  <footer class="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 transition-colors">
    <div v-if="isListening && interimText" class="max-w-3xl mx-auto mb-1.5">
      <span class="text-xs text-indigo-400 dark:text-indigo-300 animate-pulse">正在识别: {{ interimText }}</span>
    </div>

    <div class="flex items-end gap-2 max-w-3xl mx-auto">
      <textarea
        :value="modelValue"
        rows="1"
        :disabled="isLoading"
        :placeholder="isLoading ? 'AI 思考中...' : '输入消息，Enter 发送，Shift+Enter 换行'"
        class="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-4 py-2.5 text-[15px] text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none transition-colors focus:border-blue-400 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800 disabled:opacity-50 max-h-32 overflow-y-auto"
        @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
        @keydown="emit('keydown', $event)"
      />

      <button
        v-if="speechSupported && !isLoading"
        class="h-10 w-10 flex items-center justify-center rounded-xl transition-all active:scale-95 shrink-0"
        :class="isListening
          ? 'bg-red-500 text-white animate-pulse'
          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'"
        :title="isListening ? '停止语音输入' : '语音输入'"
        @click="emit('toggle-speech')"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path v-if="!isListening" stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          <path v-else stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
      </button>

      <button
        v-if="isLoading"
        class="h-10 px-5 rounded-xl bg-gray-500 text-white font-medium text-sm transition-all hover:bg-gray-600 active:scale-95 shrink-0"
        @click="emit('abort')"
      >
        停止
      </button>
      <button
        v-else
        :disabled="!modelValue.trim()"
        class="h-10 px-5 rounded-xl bg-blue-500 text-white font-medium text-sm transition-all hover:bg-blue-600 active:scale-95 disabled:opacity-40 disabled:pointer-events-none shrink-0"
        @click="emit('send')"
      >
        发送
      </button>
    </div>
  </footer>
</template>
