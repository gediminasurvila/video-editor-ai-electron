import { useState } from 'react'
import { theme } from '../../app/theme'
import { useEditor, activeSequence } from '../../state/store'
import { useTranscripts } from '../../state/transcripts'
import { useSettings } from '../../state/settings'
import { runCommand } from '../../commands'
import type { TranscriptWord } from '@shared/ipc'

/**
 * Transcript panel: transcribe a media item with Whisper, show word-level
 * timestamps, click to seek, select a word range and delete it from the timeline.
 */
export function TranscriptPanel(): JSX.Element {
  const project = useEditor((s) => s.project)
  const playhead = useEditor((s) => s.playhead)
  const setPlayhead = useEditor((s) => s.setPlayhead)
  const seq = activeSequence(project)
  const { transcripts, setTranscript } = useTranscripts()
  const { apiKey, provider } = useSettings()

  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Word selection: [startIdx, endIdx] inclusive, or null
  const [selection, setSelection] = useState<[number, number] | null>(null)
  const [selectAnchor, setSelectAnchor] = useState<number | null>(null)

  const mediaId = selectedMediaId ?? project.mediaPool[0]?.id ?? null
  const media = project.mediaPool.find((m) => m.id === mediaId)
  const words: TranscriptWord[] = mediaId ? (transcripts[mediaId] ?? []) : []

  // Memoize the clip lookup so it's computed once per render, not once per word.
  const activeClip = (() => {
    if (!mediaId) return undefined
    for (const track of seq?.tracks ?? []) {
      const c = track.clips.find((cl) => cl.mediaId === mediaId && cl.kind === 'media')
      if (c) return c
    }
    return undefined
  })()

  async function transcribe(): Promise<void> {
    if (!media) return
    if (!apiKey) {
      setError('No API key configured. Set an OpenAI API key in Settings.')
      return
    }
    if (provider !== 'openai') {
      setError('Transcription uses the OpenAI Whisper API. Set your provider to OpenAI in Settings.')
      return
    }
    setLoading(true)
    setError(null)
    setSelection(null)
    try {
      const result = await window.api.transcribeMedia(media.filePath, apiKey)
      setTranscript(media.id, result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function wordTimelineTime(word: TranscriptWord): number | null {
    if (!activeClip) return null
    // word.start is relative to the source file; map to timeline time via clip.inPoint
    return activeClip.start + (word.start - activeClip.inPoint)
  }

  function seekToWord(word: TranscriptWord): void {
    const t = wordTimelineTime(word)
    if (t !== null) setPlayhead(Math.max(0, t))
  }

  function isWordAtPlayhead(word: TranscriptWord): boolean {
    if (!activeClip) return false
    const t = wordTimelineTime(word)
    if (t === null) return false
    const dur = word.end - word.start
    return playhead >= t && playhead < t + dur
  }

  function onWordPointerDown(e: React.PointerEvent, idx: number): void {
    // Capture the pointer so pointerup fires even if the cursor leaves the element.
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setSelectAnchor(idx)
    setSelection([idx, idx])
    seekToWord(words[idx])
  }

  function onWordPointerEnter(idx: number): void {
    if (selectAnchor === null) return
    const lo = Math.min(selectAnchor, idx)
    const hi = Math.max(selectAnchor, idx)
    setSelection([lo, hi])
  }

  function onWordPointerUp(): void {
    setSelectAnchor(null)
  }

  async function deleteSelection(): Promise<void> {
    if (!selection || !activeClip) return
    const [lo, hi] = selection
    const startWord = words[lo]
    const endWord = words[hi]
    const inPoint = activeClip.start + (startWord.start - activeClip.inPoint)
    const outPoint = activeClip.start + (endWord.end - activeClip.inPoint)
    await runCommand('delete_range', { inPoint: Math.max(0, inPoint), outPoint: Math.max(0, outPoint), ripple: true })
    setSelection(null)
  }

  const isSelected = (idx: number): boolean =>
    selection !== null && idx >= selection[0] && idx <= selection[1]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `0 ${theme.space.sm}px`,
          borderBottom: `1px solid ${theme.color.border}`,
          fontSize: theme.font.size.sm,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: theme.color.textDim
        }}
      >
        <span>Transcript</span>
        {project.mediaPool.length > 1 && (
          <select
            value={mediaId ?? ''}
            onChange={(e) => {
              setSelectedMediaId(e.target.value || null)
              setSelection(null)
            }}
            style={{ fontSize: theme.font.size.sm, background: theme.color.bg, color: theme.color.text, border: 'none' }}
          >
            {project.mediaPool.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: theme.space.sm }}>
        {!media ? (
          <p style={{ color: theme.color.textDim, fontSize: theme.font.size.sm }}>
            Import media to transcribe.
          </p>
        ) : words.length === 0 ? (
          <div>
            {error && (
              <p style={{ color: theme.color.danger, fontSize: theme.font.size.sm, marginBottom: theme.space.sm }}>
                {error}
              </p>
            )}
            <p style={{ color: theme.color.textDim, fontSize: theme.font.size.sm, marginBottom: theme.space.sm }}>
              No transcript yet for <strong>{media.name}</strong>.
              <br />
              Requires an OpenAI API key (Whisper).
            </p>
            <button
              onClick={() => void transcribe()}
              disabled={loading}
              style={{ background: theme.color.accentDim, borderColor: theme.color.accent, color: '#fff' }}
            >
              {loading ? 'Transcribing…' : 'Transcribe'}
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: theme.space.sm,
                flexWrap: 'wrap',
                gap: theme.space.xs
              }}
            >
              <button
                onClick={() => void transcribe()}
                disabled={loading}
                style={{ fontSize: theme.font.size.sm }}
              >
                {loading ? 'Re-transcribing…' : 'Re-transcribe'}
              </button>
              {selection && (
                <button
                  onClick={() => void deleteSelection()}
                  style={{
                    background: theme.color.danger,
                    color: '#fff',
                    border: 'none',
                    fontSize: theme.font.size.sm
                  }}
                >
                  Cut selection ({selection[1] - selection[0] + 1} words)
                </button>
              )}
            </div>

            <div
              style={{ lineHeight: 1.9, fontSize: theme.font.size.md }}
              onPointerUp={onWordPointerUp}
            >
              {words.map((w, i) => {
                const atPlayhead = isWordAtPlayhead(w)
                const selected = isSelected(i)
                return (
                  <span
                    key={i}
                    onPointerDown={(e) => onWordPointerDown(e, i)}
                    onPointerEnter={() => onWordPointerEnter(i)}
                    style={{
                      display: 'inline-block',
                      marginRight: 4,
                      padding: '1px 3px',
                      borderRadius: 3,
                      cursor: 'pointer',
                      userSelect: 'none',
                      background: selected
                        ? theme.color.danger
                        : atPlayhead
                          ? theme.color.accentDim
                          : 'transparent',
                      color: selected || atPlayhead ? '#fff' : theme.color.text,
                      transition: 'background 0.1s'
                    }}
                    title={`${w.start.toFixed(2)}s – ${w.end.toFixed(2)}s`}
                  >
                    {w.word}
                  </span>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
