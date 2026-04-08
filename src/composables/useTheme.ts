import { ref, watch } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

const THEME_KEY = 'ai-chat-theme'

const mode = ref<ThemeMode>(
  (localStorage.getItem(THEME_KEY) as ThemeMode | null) ?? 'system'
)

function getSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function apply() {
  const dark = mode.value === 'dark' || (mode.value === 'system' && getSystemDark())
  document.documentElement.classList.toggle('dark', dark)
}

apply()

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (mode.value === 'system') apply()
})

watch(mode, () => {
  localStorage.setItem(THEME_KEY, mode.value)
  apply()
})

export function useTheme() {
  const cycle: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'system', system: 'light' }

  function toggleTheme() {
    mode.value = cycle[mode.value]
  }

  return { mode, toggleTheme }
}
