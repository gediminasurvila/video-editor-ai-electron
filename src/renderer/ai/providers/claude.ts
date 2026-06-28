import Anthropic from '@anthropic-ai/sdk'
import type {
  BetaMessageParam,
  BetaTextBlockParam,
  BetaToolResultBlockParam,
  BetaContentBlockParam,
  BetaTool
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { AgentProvider, ProviderTurn, ToolDef, ToolResult } from './types'
import type { CommandName } from '@shared/commands'

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-8'

export class ClaudeProvider implements AgentProvider {
  readonly id = 'claude'
  private client: Anthropic
  private system: BetaTextBlockParam[] = []
  private tools: BetaTool[] = []
  private messages: BetaMessageParam[] = []

  constructor(apiKey: string, private model = DEFAULT_CLAUDE_MODEL) {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  }

  begin(system: string, tools: ToolDef[]): void {
    // Cache the system prompt — it never changes mid-session.
    this.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]

    this.tools = tools.map((t, i) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as BetaTool['input_schema'],
      // Cache the full tool list after the last entry.
      ...(i === tools.length - 1 ? { cache_control: { type: 'ephemeral' } } : {})
    }))

    this.messages = []
  }

  private async run(): Promise<ProviderTurn> {
    // Mark the last user content block so conversation history is cached on
    // subsequent turns — measured at 84-99% cache-read rate in practice. (palmier #26)
    const msgs = markLastUserBlockForCache(this.messages)

    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: this.system,
      tools: this.tools,
      messages: msgs,
      betas: ['prompt-caching-2024-07-31']
    })

    this.messages.push({ role: 'assistant', content: res.content as BetaContentBlockParam[] })

    let text = ''
    const toolCalls: ProviderTurn['toolCalls'] = []
    for (const block of res.content) {
      if (block.type === 'text') text += block.text
      else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name as CommandName, args: block.input })
      }
    }
    return { text, toolCalls }
  }

  async sendUser(message: string): Promise<ProviderTurn> {
    this.messages.push({ role: 'user', content: message })
    return this.run()
  }

  async sendToolResults(results: ToolResult[]): Promise<ProviderTurn> {
    this.messages.push({
      role: 'user',
      content: results.map((r): BetaToolResultBlockParam => ({
        type: 'tool_result',
        tool_use_id: r.id,
        content: JSON.stringify(r.output),
        is_error: r.isError
      }))
    })
    return this.run()
  }
}

/**
 * Return a copy of `messages` where the last content block of the last
 * user-role message has `cache_control: {type:"ephemeral"}` set, telling
 * Anthropic to cache everything up to that point for subsequent requests.
 */
function markLastUserBlockForCache(messages: BetaMessageParam[]): BetaMessageParam[] {
  let lastUserIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') { lastUserIdx = i; break }
  }
  if (lastUserIdx === -1) return messages

  return messages.map((m, i) => {
    if (i !== lastUserIdx) return m

    const raw = m.content
    const content: BetaContentBlockParam[] = Array.isArray(raw)
      ? (raw as BetaContentBlockParam[])
      : [{ type: 'text', text: raw as string } as BetaTextBlockParam]

    if (content.length === 0) return m

    const last = content[content.length - 1]
    let marked: BetaContentBlockParam

    if (last.type === 'text') {
      marked = { ...(last as BetaTextBlockParam), cache_control: { type: 'ephemeral' } }
    } else if (last.type === 'tool_result') {
      marked = { ...(last as BetaToolResultBlockParam), cache_control: { type: 'ephemeral' } }
    } else {
      marked = last
    }

    return { ...m, content: [...content.slice(0, -1), marked] }
  })
}
