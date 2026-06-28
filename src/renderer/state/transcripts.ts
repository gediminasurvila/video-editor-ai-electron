import { create } from 'zustand'
import type { TranscriptWord } from '@shared/ipc'

interface TranscriptState {
  /** Map of mediaId → word array from Whisper. */
  transcripts: Record<string, TranscriptWord[]>
  setTranscript: (mediaId: string, words: TranscriptWord[]) => void
  clearTranscript: (mediaId: string) => void
}

export const useTranscripts = create<TranscriptState>((set) => ({
  transcripts: {},
  setTranscript: (mediaId, words) =>
    set((s) => ({ transcripts: { ...s.transcripts, [mediaId]: words } })),
  clearTranscript: (mediaId) =>
    set((s) => {
      const next = { ...s.transcripts }
      delete next[mediaId]
      return { transcripts: next }
    })
}))
