import { ref, onBeforeUnmount } from 'vue'

type Recognizer = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: any) => void) | null
  onerror: ((e: any) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

const SpeechRecognitionCtor: (new () => Recognizer) | undefined =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition

const AUTO_STOP_MS = 5000

export function useSpeechInput(onFinal: (text: string) => void) {
  const isListening = ref(false)
  const interimText = ref('')
  const speechError = ref('')
  const isSupported = !!SpeechRecognitionCtor

  let recognition: Recognizer | null = null
  let autoStopTimer: ReturnType<typeof setTimeout> | null = null

  function resetAutoStop() {
    if (autoStopTimer) clearTimeout(autoStopTimer)
    autoStopTimer = setTimeout(() => stop(), AUTO_STOP_MS)
  }

  function clearAutoStop() {
    if (autoStopTimer) {
      clearTimeout(autoStopTimer)
      autoStopTimer = null
    }
  }

  function start() {
    if (!SpeechRecognitionCtor || isListening.value) return

    speechError.value = ''

    recognition = new SpeechRecognitionCtor()
    recognition.lang = 'zh-CN'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (e: any) => {
      let interim = ''
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript: string = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          final += transcript
        } else {
          interim += transcript
        }
      }
      interimText.value = interim
      if (final) {
        onFinal(final)
      }
      resetAutoStop()
    }

    recognition.onerror = (e: any) => {
      if (e.error === 'not-allowed') {
        speechError.value = '麦克风权限未授权'
      } else if (e.error === 'no-speech') {
        speechError.value = '未检测到语音'
      } else if (e.error !== 'aborted') {
        speechError.value = `语音识别出错: ${e.error || '未知错误'}`
      }
      stop()
    }

    // Chrome fires onend prematurely even with continuous:true.  If our
    // auto-stop timer is still running (the user hasn't been silent long
    // enough), restart recognition immediately.
    recognition.onend = () => {
      if (autoStopTimer) {
        // Premature end — Chrome quirk. Restart immediately.
        clearAutoStop()
        try {
          recognition?.start()
          resetAutoStop()
        } catch {
          // Restart failed, give up.
          isListening.value = false
          interimText.value = ''
        }
        return
      }
      isListening.value = false
      interimText.value = ''
    }

    recognition.start()
    isListening.value = true
    resetAutoStop()
  }

  function stop() {
    clearAutoStop()
    recognition?.stop()
    recognition = null
    isListening.value = false
    interimText.value = ''
  }

  function toggle() {
    isListening.value ? stop() : start()
  }

  onBeforeUnmount(() => stop())

  return { isListening, interimText, speechError, isSupported, toggle, stop }
}
