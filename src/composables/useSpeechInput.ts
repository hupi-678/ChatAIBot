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

const AUTO_STOP_MS = 3000

export function useSpeechInput(onFinal: (text: string) => void) {
  const isListening = ref(false)
  const interimText = ref('')
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

    recognition.onerror = () => stop()

    recognition.onend = () => {
      isListening.value = false
      interimText.value = ''
      clearAutoStop()
    }

    recognition.start()
    isListening.value = true
    resetAutoStop()
  }

  function stop() {
    recognition?.stop()
    recognition = null
    isListening.value = false
    interimText.value = ''
    clearAutoStop()
  }

  function toggle() {
    isListening.value ? stop() : start()
  }

  onBeforeUnmount(() => stop())

  return { isListening, interimText, isSupported, toggle, stop }
}
