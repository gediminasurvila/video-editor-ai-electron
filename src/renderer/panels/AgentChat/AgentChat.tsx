import { useRef, useState } from 'react'
import { theme } from '../../app/theme'
import { useSettings } from '../../state/settings'
import { ClaudeProvider } from '../../ai/providers/claude'
import type { AgentProvider } from '../../ai/providers/types'
import { runAgent, type AgentEvent } from '../../ai/agent/loop'

interface Entry {
  kind: 'user' | 'assistant' | 'tool' | 'error'
  text: string
}

export function AgentChat(): JSX.Element {
  const { provider, apiKey, model, setApiKey } = useSettings()
  const [entries, setEntries] = useState<Entry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const providerRef = useRef<AgentProvider | null>(null)
  const startedRef = useRef(false)

  function getProvider(): AgentProvider {
    if (!providerRef.current) {
      if (provider !== 'claude') throw new Error(`Provider "${provider}" not implemented yet`)
      providerRef.current = new ClaudeProvider(apiKey, model)
    }
    return providerRef.current
  }

  function push(entry: Entry): void {
    setEntries((e) => [...e, entry])
  }

  async function send(): Promise<void> {
    const message = input.trim()
    if (!message || busy) return
    if (!apiKey) {
      push({ kind: 'error', text: 'Add your API key below to use the agent.' })
      return
    }
    setInput('')
    push({ kind: 'user', text: message })
    setBusy(true)
    try {
      const fresh = !startedRef.current
      startedRef.current = true
      await runAgent(
        getProvider(),
        message,
        (e: AgentEvent) => {
          if (e.type === 'text' && e.text) push({ kind: 'assistant', text: e.text })
          else if (e.type === 'tool' && e.tool) {
            push({
              kind: 'tool',
              text: e.tool.error
                ? `✗ ${e.tool.name}: ${e.tool.error}`
                : `✓ ${e.tool.name}(${JSON.stringify(e.tool.args)})`
            })
          } else if (e.type === 'error' && e.text) push({ kind: 'error', text: e.text })
        },
        fresh
      )
    } catch (err) {
      push({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: theme.space.md }}>
        {entries.length === 0 && (
          <p style={{ color: theme.color.textDim, fontSize: theme.font.size.sm }}>
            Ask the agent to edit your timeline, e.g. “split the first clip at 5s”.
          </p>
        )}
        {entries.map((e, i) => (
          <Bubble key={i} entry={e} />
        ))}
        {busy && <div style={{ color: theme.color.textDim }}>…thinking</div>}
      </div>

      {!apiKey && (
        <div style={{ padding: theme.space.sm, borderTop: `1px solid ${theme.color.border}` }}>
          <input
            type="password"
            placeholder="Anthropic API key"
            onChange={(e) => setApiKey(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: theme.space.sm,
          padding: theme.space.sm,
          borderTop: `1px solid ${theme.color.border}`
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          rows={2}
          placeholder="Message the agent…"
          style={{ flex: 1, resize: 'none' }}
        />
        <button onClick={send} disabled={busy}>
          Send
        </button>
      </div>
    </div>
  )
}

function Bubble({ entry }: { entry: Entry }): JSX.Element {
  const color =
    entry.kind === 'user'
      ? theme.color.accent
      : entry.kind === 'tool'
        ? theme.color.textDim
        : entry.kind === 'error'
          ? theme.color.danger
          : theme.color.text
  return (
    <div
      style={{
        marginBottom: theme.space.sm,
        fontSize: entry.kind === 'tool' ? theme.font.size.sm : theme.font.size.md,
        fontFamily: entry.kind === 'tool' ? theme.font.mono : theme.font.ui,
        color,
        whiteSpace: 'pre-wrap'
      }}
    >
      {entry.kind === 'user' ? '› ' : ''}
      {entry.text}
    </div>
  )
}
