import { create } from 'zustand'

/**
 * User settings. For the skeleton the API key persists in localStorage; a later
 * milestone moves it to the OS keychain via the main process (safeStorage).
 */
interface SettingsState {
  provider: 'claude' | 'openai'
  apiKey: string
  setProvider: (p: 'claude' | 'openai') => void
  setApiKey: (k: string) => void
}

const KEY = 'video-ai.settings'

function load(): { provider: 'claude' | 'openai'; apiKey: string } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { provider: 'claude', apiKey: '' }
}

function persist(state: { provider: 'claude' | 'openai'; apiKey: string }): void {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  setProvider: (provider) => {
    set({ provider })
    persist({ provider, apiKey: get().apiKey })
  },
  setApiKey: (apiKey) => {
    set({ apiKey })
    persist({ provider: get().provider, apiKey })
  }
}))
