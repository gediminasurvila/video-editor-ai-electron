import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages'
import type { AgentProvider, ProviderTurn, ToolDef, ToolResult } from './types'
import type { CommandName } from '@shared/commands'

/** Default model — the latest, most capable Claude for agentic tool use. */
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-8'

export class ClaudeProvider implements AgentProvider {
  readonly id = 'claude'
  private client: Anthropic
  private system = ''
  private tools: Tool[] = []
  private messages: MessageParam[] = []

  constructor(apiKey: string, private model = DEFAULT_CLAUDE_MODEL) {
    // A desktop renderer is a trusted, single-user context; the key is the
    // user's own and never leaves their machine except to Anthropic.
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  }

  begin(system: string, tools: ToolDef[]): void {
    this.system = system
    this.messages = []
    this.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Tool['input_schema']
    }))
  }

  private async run(): Promise<ProviderTurn> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: this.system,
      tools: this.tools,
      messages: this.messages
    })

    this.messages.push({ role: 'assistant', content: res.content })

    let text = ''
    const toolCalls = []
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
      content: results.map((r) => ({
        type: 'tool_result' as const,
        tool_use_id: r.id,
        content: JSON.stringify(r.output),
        is_error: r.isError
      }))
    })
    return this.run()
  }
}
