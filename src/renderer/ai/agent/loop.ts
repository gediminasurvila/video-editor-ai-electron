import { runCommand } from '../../commands'
import type { AgentProvider, ProviderTurn, ToolResult } from '../providers/types'
import { AGENT_SYSTEM_PROMPT, buildToolDefs } from './tools'

export interface AgentEvent {
  type: 'text' | 'tool' | 'error'
  text?: string
  tool?: { name: string; args: unknown; output?: unknown; error?: string }
}

const MAX_TURNS = 12

/**
 * Drives one user request to completion: the provider proposes tool calls, we
 * execute them through the shared command layer, feed results back, and repeat
 * until the model returns a plain-text answer (or we hit the turn cap).
 */
export async function runAgent(
  provider: AgentProvider,
  userMessage: string,
  onEvent: (e: AgentEvent) => void,
  fresh = true
): Promise<void> {
  if (fresh) provider.begin(AGENT_SYSTEM_PROMPT, buildToolDefs())

  let turn: ProviderTurn = await provider.sendUser(userMessage)

  for (let i = 0; i < MAX_TURNS; i++) {
    if (turn.text) onEvent({ type: 'text', text: turn.text })
    if (turn.toolCalls.length === 0) return

    const results: ToolResult[] = []
    for (const call of turn.toolCalls) {
      try {
        const output = await runCommand(call.name, call.args)
        onEvent({ type: 'tool', tool: { name: call.name, args: call.args, output } })
        results.push({ id: call.id, output })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        onEvent({ type: 'tool', tool: { name: call.name, args: call.args, error: message } })
        results.push({ id: call.id, output: { error: message }, isError: true })
      }
    }
    turn = await provider.sendToolResults(results)
  }
  onEvent({ type: 'error', text: 'Agent stopped: reached maximum tool turns.' })
}
