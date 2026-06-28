import { useEffect, useRef, useState } from 'react'
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries, busy])

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
    // Keep focus on the textarea after clearing
    requestAnimationFrame(() => textareaRef.current?.focus())
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
            Ask the agent to edit your timeline — e.g. "remove all the ums from my transcript", "add a title at the start", "export to ~/Desktop/final.mp4".
          </p>
        )}
        {entries.map((e, i) => (
          <Bubble key={i} entry={e} />
        ))}
        {busy && (
          <div style={{ color: theme.color.textDim, fontSize: theme.font.size.sm }}>
            ●●● thinking
          </div>
        )}
        <div ref={bottomRef} />
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
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          rows={2}
          placeholder="Message the agent… (Enter to send, Shift+Enter for newline)"
          style={{ flex: 1, resize: 'none' }}
        />
        <button onClick={send} disabled={busy} style={{ alignSelf: 'flex-end' }}>
          Send
        </button>
      </div>
    </div>
  )
}

function Bubble({ entry }: { entry: Entry }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const color =
    entry.kind === 'user'
      ? theme.color.accent
      : entry.kind === 'tool'
        ? theme.color.textDim
        : entry.kind === 'error'
          ? theme.color.danger
          : theme.color.text

  function copy(): void {
    void navigator.clipboard.writeText(entry.text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const showCopy = entry.kind === 'assistant' || entry.kind === 'tool'

  return (
    <div
      style={{
        marginBottom: theme.space.sm,
        fontSize: entry.kind === 'tool' ? theme.font.size.sm : theme.font.size.md,
        fontFamily: entry.kind === 'tool' ? theme.font.mono : theme.font.ui,
        color,
        whiteSpace: 'pre-wrap',
        position: 'relative',
        paddingRight: showCopy ? 28 : 0
      }}
    >
      {entry.kind === 'user' ? '› ' : ''}
      {entry.text}
      {showCopy && (
        <button
          onClick={copy}
          title="Copy to clipboard"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            padding: '2px 4px',
            background: 'transparent',
            border: 'none',
            color: copied ? theme.color.accent : theme.color.textDim,
            cursor: 'pointer',
            fontSize: 11,
            opacity: 0.7
          }}
        >
          {copied ? '✓' : '⎘'}
        </button>
      )}
    </div>
  )
}
