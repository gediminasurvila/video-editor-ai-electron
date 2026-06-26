import { create } from 'zustand'

/**
 * User settings. For the skeleton the API key persists in localStorage; a later
 * milestone moves it to the OS keychain via the main process (safeStorage).
 */
export type ProviderId = 'claude' | 'openai'

interface Persisted {
  provider: ProviderId
  apiKey: string
  model: string
}

interface SettingsState extends Persisted {
  setProvider: (p: ProviderId) => void
  setApiKey: (k: string) => void
  setModel: (m: string) => void
}

const KEY = 'video-ai.settings'

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  claude: 'claude-opus-4-8',
  openai: 'gpt-4o'
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { provider: 'claude', apiKey: '', model: DEFAULT_MODELS.claude, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return { provider: 'claude', apiKey: '', model: DEFAULT_MODELS.claude }
}

export const useSettings = create<SettingsState>((set, get) => {
  const persist = (): void => {
    const { provider, apiKey, model } = get()
    localStorage.setItem(KEY, JSON.stringify({ provider, apiKey, model }))
  }
  return {
    ...load(),
    setProvider: (provider) => {
      set({ provider, model: DEFAULT_MODELS[provider] })
      persist()
    },
    setApiKey: (apiKey) => {
      set({ apiKey })
      persist()
    },
    setModel: (model) => {
      set({ model })
      persist()
    }
  }
})
