import type { CommandName } from '@shared/commands'

export interface ToolCall {
  id: string
  name: CommandName
  args: unknown
}

export interface ToolResult {
  id: string
  output: unknown
  isError?: boolean
}

export interface ToolDef {
  name: CommandName
  description: string
  /** JSON Schema for the tool's input. */
  inputSchema: Record<string, unknown>
}

/** Result of a single provider turn: assistant text plus any tool calls to run. */
export interface ProviderTurn {
  text: string
  toolCalls: ToolCall[]
}

/**
 * Provider-agnostic agent backend. The provider owns the conversation state for
 * one chat session so tool-use protocol details (Anthropic's tool_use/tool_result
 * blocks, OpenAI's tool calls, etc.) stay encapsulated. Ship ClaudeProvider as
 * the default; other providers implement the same three methods so users can
 * bring their own key/model from Settings without touching the agent loop.
 */
export interface AgentProvider {
  readonly id: string
  /** Start a fresh conversation with the given system prompt and tools. */
  begin(system: string, tools: ToolDef[]): void
  /** Send a user message and get the assistant's reply (text + tool calls). */
  sendUser(message: string): Promise<ProviderTurn>
  /** Return tool outputs for the previous turn's calls and continue. */
  sendToolResults(results: ToolResult[]): Promise<ProviderTurn>
}
