<script setup lang="ts">
import { ref } from 'vue'
import { useChat, type ChatMessagesExpose } from '../../composables/useChat'
import { useTheme } from '../../composables/useTheme'
import { useSpeechInput } from '../../composables/useSpeechInput'
import ChatSidebar from '../../components/chat/ChatSidebar.vue'
import ChatHeader from '../../components/chat/ChatHeader.vue'
import ApiKeyModal from '../../components/chat/ApiKeyModal.vue'
import ChatMessages from '../../components/chat/ChatMessages.vue'
import ChatInputArea from '../../components/chat/ChatInputArea.vue'

const messagesListRef = ref<ChatMessagesExpose | null>(null)

const {
  activeId,
  inputText,
  isLoading,
  errorMsg,
  sidebarOpen,
  apiKeyOpen,
  apiKeyInput,
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
} = useChat(messagesListRef)

const { mode: themeMode, toggleTheme } = useTheme()

const { isListening, interimText, isSupported: speechSupported, toggle: toggleSpeech } =
  useSpeechInput((text) => {
    inputText.value += text
  })
</script>

<template>
  <div class="flex h-screen bg-gray-100 dark:bg-gray-950 transition-colors">
    <div
      v-if="sidebarOpen"
      class="fixed inset-0 bg-black/40 z-20 md:hidden"
      @click="sidebarOpen = false"
    />

    <ChatSidebar
      :open="sidebarOpen"
      :sorted-conversations="sortedConversations"
      :active-id="activeId"
      @new-conversation="newConversation"
      @switch-conversation="switchConversation"
      @delete-conversation="deleteConversation"
    />

    <div class="flex-1 flex flex-col min-w-0">
      <ChatHeader
        :has-api-key="hasApiKey"
        :theme-mode="themeMode"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
        @open-api-key="apiKeyOpen = true"
        @toggle-theme="toggleTheme"
      />

      <ApiKeyModal
        :open="apiKeyOpen"
        :model-value="apiKeyInput"
        @update:open="apiKeyOpen = $event"
        @update:model-value="apiKeyInput = $event"
        @save="saveApiKey"
        @clear="clearApiKey"
      />

      <ChatMessages
        ref="messagesListRef"
        :active-messages="activeMessages"
        :scroller-items="scrollerItems"
        :is-loading="isLoading"
        :error-msg="errorMsg"
      />

      <ChatInputArea
        v-model="inputText"
        :is-loading="isLoading"
        :is-listening="isListening"
        :interim-text="interimText"
        :speech-supported="speechSupported"
        @keydown="handleKeydown"
        @send="sendMessage"
        @abort="abortRequest"
        @toggle-speech="toggleSpeech"
      />
    </div>
  </div>
</template>
