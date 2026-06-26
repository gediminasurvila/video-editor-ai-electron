import { useEffect, useState } from 'react'
import { theme } from '../../app/theme'
import { useSettings, DEFAULT_MODELS, type ProviderId } from '../../state/settings'
import type { McpStatus } from '@shared/ipc'

/**
 * In-app Settings: AI provider/model/key plus the live MCP server config with
 * copy-paste snippets so users can wire external agents without leaving the app.
 */
export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const { provider, model, apiKey, setProvider, setModel, setApiKey } = useSettings()
  const [mcp, setMcp] = useState<McpStatus | null>(null)

  useEffect(() => {
    if (!open) return
    window.api.mcpStatus().then(setMcp)
    const off = window.api.onMcpStatusChanged(setMcp)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  const url = mcp?.url ?? 'http://127.0.0.1:19789/mcp'
  const cliSnippet = `claude mcp add --transport http video-ai ${url}`
  const jsonSnippet = JSON.stringify({ mcpServers: { 'video-ai': { url } } }, null, 2)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxHeight: '86vh',
          overflowY: 'auto',
          background: theme.color.panel,
          border: `1px solid ${theme.color.border}`,
          borderRadius: theme.radius.md,
          boxShadow: '0 24px 80px -20px rgba(0,0,0,0.7)'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `${theme.space.md}px ${theme.space.lg}px`,
            borderBottom: `1px solid ${theme.color.border}`
          }}
        >
          <strong style={{ fontSize: theme.font.size.lg }}>Settings</strong>
          <button onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: theme.space.lg }}>
          <SectionTitle>AI provider</SectionTitle>
          <Row label="Provider">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as ProviderId)}
              style={selectStyle}
            >
              <option value="claude">Claude (Anthropic)</option>
              <option value="openai">OpenAI</option>
            </select>
          </Row>
          <Row label="Model">
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={DEFAULT_MODELS[provider]}
              style={{ width: 260 }}
            />
          </Row>
          <Row label="API key">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === 'claude' ? 'sk-ant-…' : 'sk-…'}
              style={{ width: 260 }}
            />
          </Row>
          <p style={hintStyle}>
            Stored locally on this machine and sent only to your provider. The in-app agent and
            MCP-driven agents share the same editor commands.
          </p>

          <div style={{ height: theme.space.lg }} />

          <SectionTitle>
            MCP server{' '}
            <span style={{ color: mcp?.running ? '#5ad07a' : theme.color.danger, fontSize: theme.font.size.sm }}>
              ● {mcp?.running ? 'running' : 'offline'}
            </span>
          </SectionTitle>
          <p style={hintStyle}>
            External agents (Claude Code, Cursor, Codex) can drive this editor over MCP. Endpoint:
          </p>
          <CopyField label="Endpoint" value={url} />
          <CopyBlock label="Claude Code" value={cliSnippet} />
          <CopyBlock label="Cursor / Claude Desktop config" value={jsonSnippet} />
        </div>
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  background: theme.color.bg,
  color: theme.color.text,
  border: `1px solid ${theme.color.border}`,
  borderRadius: theme.radius.sm,
  padding: '6px 8px',
  width: 260
}

const hintStyle: React.CSSProperties = {
  color: theme.color.textDim,
  fontSize: theme.font.size.sm,
  margin: `${theme.space.sm}px 0`
}

function SectionTitle({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        fontSize: theme.font.size.sm,
        color: theme.color.textDim,
        marginBottom: theme.space.sm,
        display: 'flex',
        gap: theme.space.sm,
        alignItems: 'center'
      }}
    >
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: theme.space.sm
      }}
    >
      <span style={{ color: theme.color.textDim, fontSize: theme.font.size.md }}>{label}</span>
      {children}
    </div>
  )
}

function CopyButton({ value }: { value: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function CopyField({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={{ marginBottom: theme.space.sm }}>
      <div style={{ fontSize: theme.font.size.sm, color: theme.color.textDim, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: theme.space.sm }}>
        <input readOnly value={value} style={{ flex: 1, fontFamily: theme.font.mono }} />
        <CopyButton value={value} />
      </div>
    </div>
  )
}

function CopyBlock({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={{ marginBottom: theme.space.sm }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4
        }}
      >
        <span style={{ fontSize: theme.font.size.sm, color: theme.color.textDim }}>{label}</span>
        <CopyButton value={value} />
      </div>
      <pre
        style={{
          margin: 0,
          background: theme.color.bg,
          border: `1px solid ${theme.color.border}`,
          borderRadius: theme.radius.sm,
          padding: theme.space.sm,
          fontFamily: theme.font.mono,
          fontSize: theme.font.size.sm,
          color: theme.color.text,
          overflowX: 'auto',
          whiteSpace: 'pre'
        }}
      >
        {value}
      </pre>
    </div>
  )
}
