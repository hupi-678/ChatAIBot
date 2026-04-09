<script setup lang="ts">
defineProps<{
  open: boolean
  modelValue: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:modelValue': [value: string]
  save: []
  clear: []
}>()
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-40 flex items-center justify-center px-4"
  >
    <div class="absolute inset-0 bg-black/40" @click="emit('update:open', false)" />
    <div class="relative w-full max-w-md rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl p-4 transition-colors">
      <div class="flex items-center justify-between mb-3">
        <div class="text-sm font-semibold text-gray-800 dark:text-gray-100">配置智谱 API Key</div>
        <button class="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" @click="emit('update:open', false)">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <input
        :value="modelValue"
        type="password"
        autocomplete="off"
        placeholder="粘贴你的 Key（仅保存在本机浏览器）"
        class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-blue-400 dark:focus:border-blue-500"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />

      <div class="flex items-center justify-between mt-4">
        <button
          class="text-sm text-red-500 hover:text-red-600"
          @click="emit('clear')"
        >
          清除
        </button>
        <div class="flex gap-2">
          <button
            class="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            @click="emit('update:open', false)"
          >
            取消
          </button>
          <button
            class="px-3 py-1.5 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            @click="emit('save')"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
