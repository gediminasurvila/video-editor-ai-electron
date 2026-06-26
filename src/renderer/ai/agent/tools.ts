import { zodToJsonSchema } from 'zod-to-json-schema'
import { commandSchemas, commandDescriptions, commandNames } from '@shared/commands'
import type { ToolDef } from '../providers/types'

/** Build the agent's tool list from the shared command registry. */
export function buildToolDefs(): ToolDef[] {
  return commandNames.map((name) => ({
    name,
    description: commandDescriptions[name],
    inputSchema: zodToJsonSchema(commandSchemas[name], { target: 'openApi3' }) as Record<
      string,
      unknown
    >
  }))
}

export const AGENT_SYSTEM_PROMPT = `You are an editing assistant embedded in the Video AI editor.
You operate on the user's open project by calling the provided tools — the same
commands a human uses, so every change is visible on the timeline and undoable.

Guidelines:
- Inspect state with get_timeline_state before making non-trivial edits.
- All times are in seconds. Prefer small, verifiable steps.
- When the user asks for an edit, perform it with tools rather than only describing it.
- Confirm what you changed in plain language when done.`
